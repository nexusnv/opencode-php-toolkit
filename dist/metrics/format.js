function formatTimestamp(iso) {
    if (!iso)
        return "never";
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime()))
        return "unknown";
    return `${parsed.toISOString().slice(0, 10)} ${parsed.toISOString().slice(11, 16)}Z`;
}
function plural(count, word) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
}
function pad(label, width) {
    return label.padEnd(width, " ");
}
function totalFindings(metrics) {
    return Object.values(metrics.tools).reduce((sum, entry) => sum + entry.findings, 0);
}
function totalRuns(metrics) {
    return Object.values(metrics.tools).reduce((sum, entry) => sum + entry.runs, 0);
}
function toolLines(metrics) {
    const entries = Object.entries(metrics.tools).sort((a, b) => b[1].runs - a[1].runs);
    if (!entries.length)
        return ["    (no tool has run yet)"];
    const width = Math.max(...entries.map(([name]) => name.length));
    return entries.map(([name, entry]) => {
        const runs = `${entry.runs} ${entry.runs === 1 ? "run" : "runs"}`;
        const outcomes = `${entry.ok} ok / ${entry.error} error`;
        return [
            `    ${pad(name, width)}  ${pad(runs, 8)}  ${pad(outcomes, 16)}  ${pad(plural(entry.findings, "finding"), 13)}  last ${formatTimestamp(entry.lastUsedAt)}`,
        ].join("");
    });
}
function commandLines(metrics) {
    const entries = Object.entries(metrics.commands).sort((a, b) => b[1].count - a[1].count);
    if (!entries.length)
        return ["    (no command has run yet)"];
    const width = Math.max(...entries.map(([name]) => name.length));
    return entries.map(([name, entry]) => `    ${pad(name, width)}  ${plural(entry.count, "invocation")}  last ${formatTimestamp(entry.lastUsedAt)}`);
}
function projectLines(projects) {
    if (!projects.length)
        return ["    (no other project has been tracked yet)"];
    const rows = projects
        .map((p) => ({
        name: p.metrics.projectName || p.metrics.projectPath || "unknown",
        runs: totalRuns(p.metrics),
        findings: totalFindings(p.metrics),
        prompts: p.metrics.triggerHits,
        current: p.current === true,
    }))
        .sort((a, b) => Number(b.current) - Number(a.current) || b.runs - a.runs);
    const width = Math.max(...rows.map((r) => r.name.length));
    const lines = rows.map((r) => {
        const label = r.current ? `${r.name} (this project)` : r.name;
        return `    ${pad(label, width)}  ${pad(`${r.runs} runs`, 10)}  ${pad(plural(r.findings, "finding"), 11)}  ${plural(r.prompts, "prompt")}`;
    });
    const totalRunsAll = rows.reduce((sum, r) => sum + r.runs, 0);
    const totalFindingsAll = rows.reduce((sum, r) => sum + r.findings, 0);
    const totalPromptsAll = rows.reduce((sum, r) => sum + r.prompts, 0);
    lines.push(`    ${pad("TOTAL", width)}  ${pad(`${totalRunsAll} runs`, 10)}  ${pad(plural(totalFindingsAll, "finding"), 11)}  ${plural(totalPromptsAll, "prompt")}`);
    return lines;
}
/**
 * Renders the metrics snapshot a user sees.
 *
 * `others` adds the cross-project breakdown (the toolkit tracks one document
 * per project root, so this is the machine-wide view).
 */
export function formatMetricsSnapshot(m, others) {
    const findings = totalFindings(m);
    const lines = [
        "PHP toolkit metrics (local-only, never leaves this machine)",
        `  Project: ${m.projectName || "unknown"}  (${m.projectPath || "unknown"})`,
        `  Tracking since: ${formatTimestamp(m.startedAt)}`,
        `  PHP-mentioning prompts: ${m.triggerHits}`,
        "",
        "  Tools",
        ...toolLines(m),
        "",
        "  Commands",
        ...commandLines(m),
        "",
        `  Impact: ${plural(findings, "issue")} surfaced by the toolkit in this project.`,
    ];
    if (others) {
        lines.push("", "  All projects on this machine", ...projectLines([{ metrics: m, current: true }, ...others.map((metrics) => ({ metrics }))]));
    }
    return lines.join("\n");
}
//# sourceMappingURL=format.js.map
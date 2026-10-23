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
        return `    ${pad(name, width)}  ${pad(runs, 8)}  ${pad(outcomes, 16)}  ${pad(plural(entry.findings, "finding"), 13)}  last ${formatTimestamp(entry.lastUsedAt)}`;
    });
}
function commandLines(metrics) {
    const entries = Object.entries(metrics.commands).sort((a, b) => b[1].count - a[1].count);
    if (!entries.length)
        return ["    (no command has run yet)"];
    const width = Math.max(...entries.map(([name]) => name.length));
    return entries.map(([name, entry]) => `    ${pad(name, width)}  ${plural(entry.count, "invocation")}  last ${formatTimestamp(entry.lastUsedAt)}`);
}
function projectLines(scan, current) {
    if (scan.failed) {
        return ["    (unavailable - the project list could not be read)"];
    }
    const rows = [
        { metrics: current, current: true },
        ...scan.projects.map((metrics) => ({ metrics, current: false })),
    ]
        .map((p) => ({
        name: p.metrics.projectName || "unknown",
        runs: totalRuns(p.metrics),
        findings: totalFindings(p.metrics),
        prompts: p.metrics.triggerHits,
        current: p.current,
    }))
        .sort((a, b) => Number(b.current) - Number(a.current) || b.runs - a.runs);
    if (!rows.length)
        return ["    (no other project has been tracked yet)"];
    const width = Math.max(...rows.map((r) => r.name.length));
    const lines = rows.map((r) => {
        const label = r.current ? `${r.name} (this project)` : r.name;
        return `    ${pad(label, width)}  ${pad(`${r.runs} runs`, 10)}  ${pad(plural(r.findings, "finding"), 11)}  ${plural(r.prompts, "prompt")}`;
    });
    const totalRunsAll = rows.reduce((sum, r) => sum + r.runs, 0);
    const totalFindingsAll = rows.reduce((sum, r) => sum + r.findings, 0);
    const totalPromptsAll = rows.reduce((sum, r) => sum + r.prompts, 0);
    lines.push(`    ${pad("TOTAL", width)}  ${pad(`${totalRunsAll} runs`, 10)}  ${pad(plural(totalFindingsAll, "finding"), 11)}  ${plural(totalPromptsAll, "prompt")}`);
    if (scan.truncated) {
        lines.push("    (partial - more projects exist than could be listed)");
    }
    return lines;
}
/**
 * Renders the metrics snapshot a user sees.
 *
 * The snapshot is returned as tool output, so it can end up in a request to a
 * remote model provider. It therefore contains no absolute paths, no file
 * names and no code - only counts, timings and the project folder name.
 *
 * `scan` adds the cross-project breakdown (the toolkit tracks one document
 * per project root, so this is the machine-wide view).
 */
export function formatMetricsSnapshot(m, scan) {
    const findings = totalFindings(m);
    const lines = [
        "PHP toolkit metrics (stored locally - the plugin sends no telemetry)",
        `  Project: ${m.projectName || "unknown"}`,
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
    if (scan) {
        lines.push("", "  All projects on this machine", ...projectLines(scan, m));
    }
    return lines.join("\n");
}
//# sourceMappingURL=format.js.map
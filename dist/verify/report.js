import { aggregateStatus, countStatuses, findingsTotal } from "./aggregate.js";
import { VERIFICATION_CHECKS } from "./types.js";
export const MAX_VERIFICATION_CHARS = 24_000;
const ICONS = {
    passed: "✅",
    failed: "❌",
    warning: "⚠️",
    skipped: "⏭️",
    unavailable: "⏭️",
    timed_out: "⏱️",
    cancelled: "🚫",
};
const STATUS_ORDER = [
    "passed",
    "failed",
    "warning",
    "skipped",
    "unavailable",
    "timed_out",
    "cancelled",
];
function ordered(results) {
    const rank = new Map(VERIFICATION_CHECKS.map((check, index) => [check, index]));
    return [...results].sort((a, b) => (rank.get(a.check) ?? 99) - (rank.get(b.check) ?? 99));
}
function summaryLine(results, status) {
    const counts = countStatuses(results);
    const parts = STATUS_ORDER.filter((key) => counts[key] > 0).map((key) => `${counts[key]} ${key.replace("_", "-")}`);
    return parts.length ? `Summary: ${status} — ${parts.join(", ")}.` : `Summary: ${status}.`;
}
function nextLine(status) {
    if (status === "failed")
        return "Next: fix the failing checks, then rerun php_verify.";
    if (status === "passed")
        return "Next: none.";
    if (status === "unavailable")
        return "Next: install or configure the project's tooling, or report which checks are unavailable.";
    if (status === "error")
        return "Next: correct the input or report the verification error.";
    return "Next: resolve the unavailable checks or report which checks could not run.";
}
function detailLines(result) {
    if (!result.detail)
        return [];
    return result.detail
        .split("\n")
        .slice(0, 8)
        .map((line) => `    ${line}`);
}
export function renderVerificationReport(input) {
    if (input.error) {
        const text = [
            `PHP verification (scope: ${input.scope})`,
            "",
            `Verification error: ${input.error}`,
            nextLine("error"),
        ].join("\n");
        return { text: text.slice(0, MAX_VERIFICATION_CHARS), status: "error", findings: 0 };
    }
    const checks = ordered(input.checks);
    const status = aggregateStatus(checks);
    const findings = findingsTotal(checks);
    const lines = [`PHP verification (scope: ${input.scope})`];
    if (input.changedNote)
        lines.push(input.changedNote);
    if (input.permissionNote)
        lines.push(`Permission: ${input.permissionNote}`);
    if (checks.length === 0) {
        lines.push("", "Summary: unavailable — no checks were requested.", nextLine("unavailable"));
    }
    else {
        lines.push("");
        for (const result of checks) {
            const reason = result.reason ? ` (${result.reason})` : "";
            lines.push(`${ICONS[result.status]} ${result.check.padEnd(12)} ${result.summary}${reason}`);
            lines.push(...detailLines(result));
        }
        lines.push("", summaryLine(checks, status), nextLine(status));
    }
    let text = lines.join("\n");
    if (text.length > MAX_VERIFICATION_CHARS) {
        const notice = "\n[report truncated at 24,000 characters]";
        text = text.slice(0, MAX_VERIFICATION_CHARS - notice.length) + notice;
    }
    return { text, status, findings };
}
//# sourceMappingURL=report.js.map
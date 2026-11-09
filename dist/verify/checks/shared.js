import { access } from "node:fs/promises";
import { PERMISSION_APPROVAL_CODE, PERMISSION_DENIED_CODE, isMissingBinary, } from "../../tools/runner.js";
import { REASONS, } from "../types.js";
function result(check, status, reason, summary, findings = 0, detail = null) {
    return { check, status, reason, summary, findings, detail };
}
export const passed = (check, summary) => result(check, "passed", null, summary);
export const failed = (check, summary, findings, detail = null) => result(check, "failed", null, summary, findings, detail);
export const warning = (check, reason, summary, findings = 0, detail = null) => result(check, "warning", reason, summary, findings, detail);
export const skipped = (check, reason, summary) => result(check, "skipped", reason, summary);
export const unavailable = (check, reason, summary, detail = null) => result(check, "unavailable", reason, summary, 0, detail);
export const cancelled = (check, reason, summary, detail = null) => result(check, "cancelled", reason, summary, 0, detail);
export const timedOut = (check, summary) => result(check, "timed_out", REASONS.timeout, summary);
export async function pathExists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
/** Maps raw runner failures (style/architecture spawn directly). */
export function runFailure(check, result, missingSummary) {
    if (result.aborted)
        return cancelled(check, REASONS.aborted, "interrupted by AbortSignal");
    if (result.killed)
        return timedOut(check, "exceeded the check timeout");
    if (result.code === PERMISSION_DENIED_CODE) {
        return cancelled(check, REASONS.permissionDenied, "command denied by session permissions");
    }
    if (result.code === PERMISSION_APPROVAL_CODE) {
        return cancelled(check, REASONS.approvalRequired, "command requires approval");
    }
    if (isMissingBinary(result))
        return unavailable(check, REASONS.notInstalled, missingSummary);
    return null;
}
function firstLine(text) {
    const line = text.split("\n").find((candidate) => candidate.trim().length > 0) ?? "check could not run";
    return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}
/**
 * Maps a tool failure or operational error to a failed check, or returns null
 * when the tool completed and the adapter should interpret its findings.
 */
export function failureResult(check, outcome) {
    switch (outcome.failure) {
        case "aborted":
            return cancelled(check, REASONS.aborted, "interrupted by AbortSignal");
        case "timed-out":
            return timedOut(check, "exceeded the check timeout");
        case "permission-denied":
            return cancelled(check, REASONS.permissionDenied, "command denied by session permissions");
        case "permission-approval-required":
            return cancelled(check, REASONS.approvalRequired, "command requires approval");
        case "missing-tool":
            return unavailable(check, REASONS.notInstalled, firstLine(outcome.text), outcome.text);
        case "execution":
            return unavailable(check, REASONS.executionFailed, firstLine(outcome.text), outcome.text);
        default:
            break;
    }
    if (outcome.status === "error") {
        return unavailable(check, REASONS.executionFailed, firstLine(outcome.text), outcome.text);
    }
    return null;
}
//# sourceMappingURL=shared.js.map
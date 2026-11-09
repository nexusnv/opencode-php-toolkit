export const VERIFICATION_CHECKS = [
    "lint",
    "composer",
    "tests",
    "static",
    "style",
    "architecture",
];
export const CHECK_STATUSES = [
    "passed",
    "failed",
    "warning",
    "skipped",
    "unavailable",
    "timed_out",
    "cancelled",
];
/** Stable reason codes. They are categories, never raw command output. */
export const REASONS = {
    noChangedFiles: "no-changed-files",
    noRelevantChanges: "no-relevant-changes",
    notInstalled: "not-installed",
    notConfigured: "not-configured",
    changedScopeUnavailable: "changed-scope-unavailable",
    scannerUnavailable: "scanner-unavailable",
    fullSuiteFallback: "tests:full-suite-fallback",
    noTestReport: "no-test-report",
    permissionDenied: "permission:denied",
    approvalRequired: "permission:approval-required",
    aborted: "aborted",
    timeout: "timeout",
    executionFailed: "execution-failed",
};
export function isVerificationCheck(value) {
    return typeof value === "string" && VERIFICATION_CHECKS.includes(value);
}
//# sourceMappingURL=types.js.map
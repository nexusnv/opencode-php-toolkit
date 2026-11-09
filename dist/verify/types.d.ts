export declare const VERIFICATION_CHECKS: readonly ["lint", "composer", "tests", "static", "style", "architecture"];
export type VerificationCheck = (typeof VERIFICATION_CHECKS)[number];
export declare const CHECK_STATUSES: readonly ["passed", "failed", "warning", "skipped", "unavailable", "timed_out", "cancelled"];
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export type AggregateStatus = "passed" | "failed" | "partial" | "unavailable" | "error";
export type VerificationScope = "changed" | "all";
/** Stable reason codes. They are categories, never raw command output. */
export declare const REASONS: {
    readonly noChangedFiles: "no-changed-files";
    readonly noRelevantChanges: "no-relevant-changes";
    readonly notInstalled: "not-installed";
    readonly notConfigured: "not-configured";
    readonly changedScopeUnavailable: "changed-scope-unavailable";
    readonly scannerUnavailable: "scanner-unavailable";
    readonly fullSuiteFallback: "tests:full-suite-fallback";
    readonly noTestReport: "no-test-report";
    readonly permissionDenied: "permission:denied";
    readonly approvalRequired: "permission:approval-required";
    readonly aborted: "aborted";
    readonly timeout: "timeout";
    readonly executionFailed: "execution-failed";
};
export interface CheckResult {
    check: VerificationCheck;
    status: CheckStatus;
    /** Stable reason code when status is not passed/failed; null otherwise. */
    reason: string | null;
    /** One-line result shown in the report. */
    summary: string;
    findings: number;
    /** Multi-line evidence for failures, already bounded by the adapter. */
    detail: string | null;
}
export interface VerificationReport {
    scope: VerificationScope;
    checks: CheckResult[];
    status: AggregateStatus;
    findings: number;
    /** Rendered report, capped at 24,000 characters. */
    text: string;
}
export declare function isVerificationCheck(value: unknown): value is VerificationCheck;

export const VERIFICATION_CHECKS = [
  "lint",
  "composer",
  "tests",
  "static",
  "style",
  "architecture",
] as const;

export type VerificationCheck = (typeof VERIFICATION_CHECKS)[number];

export const CHECK_STATUSES = [
  "passed",
  "failed",
  "warning",
  "skipped",
  "unavailable",
  "timed_out",
  "cancelled",
] as const;

export type CheckStatus = (typeof CHECK_STATUSES)[number];
export type AggregateStatus = "passed" | "failed" | "partial" | "unavailable" | "error";
export type VerificationScope = "changed" | "all";

/** Stable reason codes. They are categories, never raw command output. */
export const REASONS = {
  noChangedFiles: "no-changed-files",
  noRelevantChanges: "no-relevant-changes",
  notInstalled: "not-installed",
  notConfigured: "not-configured",
  changedScopeUnavailable: "changed-scope-unavailable",
  scannerUnavailable: "scanner-unavailable",
  fullSuiteFallback: "tests:full-suite-fallback",
  testsSkipped: "tests:skipped",
  noTestReport: "no-test-report",
  permissionDenied: "permission:denied",
  approvalRequired: "permission:approval-required",
  aborted: "aborted",
  timeout: "timeout",
  executionFailed: "execution-failed",
} as const;

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

export function isVerificationCheck(value: unknown): value is VerificationCheck {
  return typeof value === "string" && (VERIFICATION_CHECKS as readonly string[]).includes(value);
}

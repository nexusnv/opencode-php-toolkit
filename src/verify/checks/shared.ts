import type { ProjectProfile } from "../../profile.js";
import type { ToolOutcome } from "../../tools/php-tools.js";
import type { CommandRunner } from "../../tools/runner.js";
import type { ChangedScope } from "../changed.js";
import {
  REASONS,
  type CheckResult,
  type CheckStatus,
  type VerificationCheck,
  type VerificationScope,
} from "../types.js";

export interface CheckEnvironment {
  root: string;
  profile: ProjectProfile;
  scope: VerificationScope;
  changed: ChangedScope;
  /** Root-relative PHP files selected for lint/static/style. */
  files: string[];
  runner: CommandRunner;
  signal: AbortSignal;
}

function result(
  check: VerificationCheck,
  status: CheckStatus,
  reason: string | null,
  summary: string,
  findings = 0,
  detail: string | null = null,
): CheckResult {
  return { check, status, reason, summary, findings, detail };
}

export const passed = (check: VerificationCheck, summary: string): CheckResult =>
  result(check, "passed", null, summary);

export const failed = (
  check: VerificationCheck,
  summary: string,
  findings: number,
  detail: string | null = null,
): CheckResult => result(check, "failed", null, summary, findings, detail);

export const warning = (
  check: VerificationCheck,
  reason: string,
  summary: string,
  findings = 0,
  detail: string | null = null,
): CheckResult => result(check, "warning", reason, summary, findings, detail);

export const skipped = (check: VerificationCheck, reason: string, summary: string): CheckResult =>
  result(check, "skipped", reason, summary);

export const unavailable = (
  check: VerificationCheck,
  reason: string,
  summary: string,
  detail: string | null = null,
): CheckResult => result(check, "unavailable", reason, summary, 0, detail);

export const cancelled = (
  check: VerificationCheck,
  reason: string,
  summary: string,
  detail: string | null = null,
): CheckResult => result(check, "cancelled", reason, summary, 0, detail);

export const timedOut = (check: VerificationCheck, summary: string): CheckResult =>
  result(check, "timed_out", REASONS.timeout, summary);

function firstLine(text: string): string {
  const line = text.split("\n").find((candidate) => candidate.trim().length > 0) ?? "check could not run";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

/**
 * Maps a tool failure or operational error to a failed check, or returns null
 * when the tool completed and the adapter should interpret its findings.
 */
export function failureResult(check: VerificationCheck, outcome: ToolOutcome): CheckResult | null {
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

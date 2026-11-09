import type { AggregateStatus, CheckResult, CheckStatus } from "./types.js";

export type StatusCounts = Record<CheckStatus, number>;

export function countStatuses(results: readonly CheckResult[]): StatusCounts {
  const counts: StatusCounts = {
    passed: 0,
    failed: 0,
    warning: 0,
    skipped: 0,
    unavailable: 0,
    timed_out: 0,
    cancelled: 0,
  };
  for (const result of results) counts[result.status] += 1;
  return counts;
}

export function findingsTotal(results: readonly CheckResult[]): number {
  return results.reduce((sum, result) => sum + result.findings, 0);
}

/**
 * Deterministic aggregate status, in the spec's order:
 * error > failed > passed > unavailable > partial.
 *
 * `error` is produced by the orchestrator when no report could be built; this
 * function cannot return it from check rows alone.
 */
export function aggregateStatus(results: readonly CheckResult[]): AggregateStatus {
  if (results.length === 0) return "unavailable";
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.every((result) => result.status === "passed")) return "passed";
  if (results.every((result) => result.status === "unavailable")) return "unavailable";
  return "partial";
}

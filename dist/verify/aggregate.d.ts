import type { AggregateStatus, CheckResult, CheckStatus } from "./types.js";
export type StatusCounts = Record<CheckStatus, number>;
export declare function countStatuses(results: readonly CheckResult[]): StatusCounts;
export declare function findingsTotal(results: readonly CheckResult[]): number;
/**
 * Deterministic aggregate status, in the spec's order:
 * error > failed > passed > unavailable > partial.
 *
 * `error` is produced by the orchestrator when no report could be built; this
 * function cannot return it from check rows alone.
 */
export declare function aggregateStatus(results: readonly CheckResult[]): AggregateStatus;

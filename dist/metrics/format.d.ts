import type { PhpToolkitMetrics } from "./store.js";
/**
 * Renders the metrics snapshot a user sees.
 *
 * `others` adds the cross-project breakdown (the toolkit tracks one document
 * per project root, so this is the machine-wide view).
 */
export declare function formatMetricsSnapshot(m: PhpToolkitMetrics, others?: PhpToolkitMetrics[]): string;

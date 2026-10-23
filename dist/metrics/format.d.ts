import type { PhpToolkitMetrics } from "./store.js";
/** Result of the machine-wide scan, including whether it could be completed. */
export type ProjectScan = {
    projects: PhpToolkitMetrics[];
    truncated: boolean;
    failed: boolean;
};
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
export declare function formatMetricsSnapshot(m: PhpToolkitMetrics, scan?: ProjectScan): string;

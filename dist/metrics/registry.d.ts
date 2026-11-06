import { MetricsStore, type MetricsProject, type MetricsStorage, type RoutingMetricEvent } from "./store.js";
export type { RoutingMetricEvent } from "./store.js";
/**
 * Resolves the project a piece of work belongs to.
 *
 * A tool may be pointed at a directory other than the active project root.
 * Work inside the active project stays with that project; work outside it
 * belongs to the directory it was actually run against, so one project's
 * snapshot never absorbs another project's numbers. The result is always the
 * canonical (realpath'd) location, so two sessions that opened the same
 * project through different spellings share one metrics document, and a
 * symlink out of the project cannot absorb another project's numbers. Paths
 * that do not exist yet compare textually.
 */
export declare function resolveProjectScope(activeRoot: string, target?: string): string;
/**
 * Keeps one metrics document per project, so work is attributed to the
 * project it was actually done in. The active project is keyed by its
 * canonical path, keeping sessions that opened it through a symlink and
 * sessions that opened it directly on the same document.
 */
export declare class MetricsRegistry {
    private readonly storage;
    private readonly stores;
    private readonly activeProject;
    constructor(storage: MetricsStorage, activeProject: MetricsProject);
    /** The store for the project the plugin was loaded in. */
    get active(): MetricsStore;
    /** The store for a project root, created on first use. */
    storeFor(path: string): MetricsStore;
    /** Loads the active project's document. */
    initActive(): Promise<void>;
    /** Records one routing event, attributed to its project root when known. */
    recordRouting(event: RoutingMetricEvent, projectRoot?: string): Promise<void>;
    /** Writes pending changes for every known project. */
    flushAll(): Promise<void>;
    /** Clears the active project's metrics document and starts over. */
    resetActive(): Promise<boolean>;
}

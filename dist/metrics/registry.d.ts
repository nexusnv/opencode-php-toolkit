import { MetricsStore, type MetricsProject, type MetricsStorage } from "./store.js";
/**
 * Resolves the project a piece of work belongs to.
 *
 * A tool may be pointed at a directory other than the active project root.
 * Work inside the active project stays with that project; work outside it
 * belongs to the directory it was actually run against, so one project's
 * snapshot never absorbs another project's numbers.
 */
/**
 * Work inside the active project root resolves against that root. Paths
 * outside it (or symlinks pointing out of it) are attributed to their
 * canonical location, so the same directory is never tracked under two
 * spellings and a symlink out of the project cannot absorb another
 * project's numbers. Paths that do not exist yet compare textually.
 */
export declare function resolveProjectScope(activeRoot: string, target?: string): string;
/**
 * Keeps one metrics document per project, so work is attributed to the
 * project it was actually done in.
 */
export declare class MetricsRegistry {
    private readonly storage;
    private readonly activeProject;
    private readonly stores;
    constructor(storage: MetricsStorage, activeProject: MetricsProject);
    /** The store for the project the plugin was loaded in. */
    get active(): MetricsStore;
    /** The store for a project root, created on first use. */
    storeFor(path: string): MetricsStore;
    /** Loads the active project's document. */
    initActive(): Promise<void>;
    /** Writes pending changes for every known project. */
    flushAll(): Promise<void>;
    /** Deletes the active project's persisted document and starts over. */
    resetActive(): Promise<boolean>;
}

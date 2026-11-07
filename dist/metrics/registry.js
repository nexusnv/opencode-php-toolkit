import { realpathSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import { MetricsStore, } from "./store.js";
/**
 * Resolves symlinks eagerly. Cached canonical paths would go stale when a
 * symlink is retargeted, so every call revalidates the current destination.
 */
function tryRealpath(path) {
    try {
        return realpathSync(path);
    }
    catch {
        // Missing paths compare textually.
        return path;
    }
}
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
export function resolveProjectScope(activeRoot, target) {
    const active = tryRealpath(activeRoot);
    if (!target)
        return active;
    const absolute = tryRealpath(resolve(active, target));
    if (absolute === active || absolute.startsWith(active + sep))
        return active;
    return absolute;
}
/**
 * Keeps one metrics document per project, so work is attributed to the
 * project it was actually done in. The active project is keyed by its
 * canonical path, keeping sessions that opened it through a symlink and
 * sessions that opened it directly on the same document.
 */
export class MetricsRegistry {
    storage;
    stores = new Map();
    activeProject;
    constructor(storage, activeProject) {
        this.storage = storage;
        this.activeProject = { name: activeProject.name, path: tryRealpath(activeProject.path) };
    }
    /** The store for the project the plugin was loaded in. */
    get active() {
        return this.storeFor(this.activeProject.path);
    }
    /** The store for a project root, created on first use. */
    storeFor(path) {
        const canonical = tryRealpath(path);
        const existing = this.stores.get(canonical);
        if (existing)
            return existing;
        const store = new MetricsStore(this.storage, {
            name: basename(canonical) || canonical,
            path: canonical,
        });
        this.stores.set(canonical, store);
        // Loading is best effort: an unreadable document must not stop the
        // toolkit, and the store refuses to write over what it could not read.
        void store.init().catch(() => { });
        return store;
    }
    /** Loads the active project's document. */
    async initActive() {
        await this.active.init();
    }
    /** Records one routing event, attributed to its project root when known. */
    async recordRouting(event, projectRoot) {
        const store = projectRoot ? this.storeFor(projectRoot) : this.active;
        if (!store)
            return;
        await store.recordRouting(event);
    }
    /** Writes pending changes for every known project. */
    async flushAll() {
        await Promise.all([...this.stores.values()].map((store) => store.flush().catch(() => { })));
    }
    /** Clears the active project's metrics document and starts over. */
    async resetActive() {
        return this.active.reset();
    }
}
//# sourceMappingURL=registry.js.map
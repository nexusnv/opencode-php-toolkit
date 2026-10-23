import { basename, resolve, sep } from "node:path";
import { MetricsStore, type MetricsProject, type MetricsStorage } from "./store.js";

/**
 * Resolves the project a piece of work belongs to.
 *
 * A tool may be pointed at a directory other than the active project root.
 * Work inside the active project stays with that project; work outside it
 * belongs to the directory it was actually run against, so one project's
 * snapshot never absorbs another project's numbers.
 */
export function resolveProjectScope(activeRoot: string, target?: string): string {
  if (!target) return activeRoot;
  const absolute = resolve(activeRoot, target);
  if (absolute === activeRoot) return activeRoot;
  if (absolute.startsWith(activeRoot + sep)) return activeRoot;
  return absolute;
}

/**
 * Keeps one metrics document per project, so work is attributed to the
 * project it was actually done in.
 */
export class MetricsRegistry {
  private readonly stores = new Map<string, MetricsStore>();

  constructor(
    private readonly storage: MetricsStorage,
    private readonly activeProject: MetricsProject,
  ) {}

  /** The store for the project the plugin was loaded in. */
  get active(): MetricsStore {
    return this.storeFor(this.activeProject.path);
  }

  /** The store for a project root, created on first use. */
  storeFor(path: string): MetricsStore {
    const existing = this.stores.get(path);
    if (existing) return existing;
    const store = new MetricsStore(this.storage, { name: basename(path) || path, path });
    this.stores.set(path, store);
    // Loading is best effort: an unreadable document must not stop the
    // toolkit, and the store refuses to write over what it could not read.
    void store.init().catch(() => {});
    return store;
  }

  /** Loads the active project's document. */
  async initActive(): Promise<void> {
    await this.active.init();
  }

  /** Writes pending changes for every known project. */
  async flushAll(): Promise<void> {
    await Promise.all([...this.stores.values()].map((store) => store.flush().catch(() => {})));
  }
}

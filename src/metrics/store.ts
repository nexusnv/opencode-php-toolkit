import { createHash } from "node:crypto";

/**
 * Outcome of a single tool invocation.
 *
 * `ok` means "the tool performed its job"; `error` means "the tool could not
 * run" (missing binary, timeout, crash). Issues found in the user's code are
 * *findings*, not errors - a lint failure is a successful lint that found a
 * broken file.
 */
export type ToolRunStatus = "ok" | "error";

export type ToolMetricEntry = {
  /** Times the tool ran. */
  runs: number;
  /** Runs that produced a result. */
  ok: number;
  /** Runs that could not be performed. */
  error: number;
  /** Issues the tool surfaced (parse errors, advisories, invalid manifests). */
  findings: number;
  lastUsedAt: string;
  lastStatus: ToolRunStatus | null;
};

export type CommandMetricEntry = {
  count: number;
  lastUsedAt: string;
};

export type PhpToolkitMetrics = {
  version: number;
  startedAt: string;
  /** Basename of the project root - display only. */
  projectName: string;
  /** Absolute project root - identity of the document, display only. */
  projectPath: string;
  tools: Record<string, ToolMetricEntry>;
  commands: Record<string, CommandMetricEntry>;
  /** Prompts that mentioned the PHP ecosystem. */
  triggerHits: number;
};

export const METRICS_VERSION = 2;

/** Storage keys are `${STORAGE_PREFIX}${projectKey(path)}` - one doc per project. */
export const STORAGE_PREFIX = "php-toolkit.metrics.";

/** Upper bound on tracked tool/command names, so a corrupt doc cannot bloat. */
const MAX_ENTRIES = 200;

/** Writes are coalesced so a burst of tool calls costs one storage write. */
const PERSIST_DEBOUNCE_MS = 250;

export type MetricsProject = { name: string; path: string };

/**
 * Minimal structural storage contract used by the metrics store.
 * Matches OpenCode's local storage domain (async JSON key-value persistence).
 */
export interface MetricsStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  scan(options: { prefix: string; after?: string; limit?: number }): Promise<{
    entries: ReadonlyArray<{ key: string; value: unknown }>;
    next?: string;
  }>;
}

/** Stable, filesystem-safe identifier for a project root. */
export function projectKey(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 12);
}

export function storageKeyFor(path: string): string {
  return `${STORAGE_PREFIX}${projectKey(path)}`;
}

function initialMetrics(project: MetricsProject): PhpToolkitMetrics {
  return {
    version: METRICS_VERSION,
    startedAt: new Date().toISOString(),
    projectName: project.name,
    projectPath: project.path,
    tools: {},
    commands: {},
    triggerHits: 0,
  };
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegative(value: number | undefined): number {
  if (value === undefined) return 0;
  return value > 0 ? value : 0;
}

/**
 * Reads tool entries, accepting both the v1 shape (`count`/`okCount`/
 * `errorCount`) and the v2 shape (`runs`/`ok`/`error`). Entries that are not
 * objects are dropped instead of poisoning the counters with NaN.
 */
function migrateTools(raw: unknown): Record<string, ToolMetricEntry> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, ToolMetricEntry> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const lastStatus =
      entry.lastStatus === "ok" || entry.lastStatus === "error" ? entry.lastStatus : null;
    out[name] = {
      runs: nonNegative(num(entry.runs) ?? num(entry.count)),
      ok: nonNegative(num(entry.ok) ?? num(entry.okCount)),
      error: nonNegative(num(entry.error) ?? num(entry.errorCount)),
      findings: nonNegative(num(entry.findings)),
      lastUsedAt: typeof entry.lastUsedAt === "string" ? entry.lastUsedAt : "",
      lastStatus,
    };
    if (Object.keys(out).length >= MAX_ENTRIES) break;
  }
  return out;
}

function migrateCommands(raw: unknown): Record<string, CommandMetricEntry> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, CommandMetricEntry> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    out[name] = {
      count: nonNegative(num(entry.count)),
      lastUsedAt: typeof entry.lastUsedAt === "string" ? entry.lastUsedAt : "",
    };
    if (Object.keys(out).length >= MAX_ENTRIES) break;
  }
  return out;
}

/**
 * Turns whatever is on disk into a valid document. Unknown future versions are
 * discarded rather than misread; older versions are migrated forward.
 */
export function deserialize(raw: unknown, project: MetricsProject): PhpToolkitMetrics {
  const base = initialMetrics(project);
  if (!raw || typeof raw !== "object") return base;
  const candidate = raw as Record<string, unknown>;
  const version = num(candidate.version) ?? 0;
  if (version > METRICS_VERSION) return base;
  return {
    version: METRICS_VERSION,
    startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : base.startedAt,
    projectName: typeof candidate.projectName === "string" ? candidate.projectName : project.name,
    projectPath: typeof candidate.projectPath === "string" ? candidate.projectPath : project.path,
    tools: migrateTools(candidate.tools),
    commands: migrateCommands(candidate.commands),
    triggerHits: nonNegative(num(candidate.triggerHits)),
  };
}

/**
 * Local-only usage + outcome metrics collector for the PHP toolkit.
 *
 * Persists through OpenCode's local storage domain and never emits anything
 * over the network - all data stays inside the user's local environment.
 *
 * One document per project root, so the snapshot a user sees describes the
 * project they are working in rather than every PHP-adjacent directory on the
 * machine.
 */
export class MetricsStore {
  private doc: PhpToolkitMetrics;
  private readonly key: string;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: MetricsStorage,
    private readonly project: MetricsProject,
  ) {
    this.doc = initialMetrics(project);
    this.key = storageKeyFor(project.path);
  }

  /** Storage key this store owns. */
  get storageKey(): string {
    return this.key;
  }

  /**
   * Loads the stored document. Throws only if the storage itself fails; the
   * caller decides whether that is fatal (it must not be).
   */
  async init(): Promise<void> {
    const raw = await this.storage.get(this.key);
    this.doc = deserialize(raw, this.project);
  }

  getSnapshot(): PhpToolkitMetrics {
    return this.doc;
  }

  async recordTool(input: { tool: string; status: ToolRunStatus; findings?: number }): Promise<void> {
    const entry = this.doc.tools[input.tool] ?? {
      runs: 0,
      ok: 0,
      error: 0,
      findings: 0,
      lastUsedAt: "",
      lastStatus: null,
    };
    entry.runs += 1;
    if (input.status === "ok") {
      entry.ok += 1;
    } else {
      entry.error += 1;
    }
    entry.findings += nonNegative(input.findings);
    entry.lastUsedAt = new Date().toISOString();
    entry.lastStatus = input.status;
    this.doc.tools[input.tool] = entry;
    this.markDirty();
  }

  async recordCommand(input: { name: string }): Promise<void> {
    const entry = this.doc.commands[input.name] ?? { count: 0, lastUsedAt: "" };
    entry.count += 1;
    entry.lastUsedAt = new Date().toISOString();
    this.doc.commands[input.name] = entry;
    this.markDirty();
  }

  async recordTrigger(): Promise<void> {
    this.doc.triggerHits += 1;
    this.markDirty();
  }

  /**
   * Persists pending changes. Writes are coalesced, so a burst of tool calls
   * costs a single storage write instead of one per event.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await this.storage.set(this.key, this.doc);
    } catch {
      // Metrics are best-effort: a storage failure must never break the plugin.
      // Keep the change pending so the next flush retries it.
      this.dirty = true;
    }
  }

  /** Documents of the other projects tracked on this machine. */
  async listOtherProjects(): Promise<PhpToolkitMetrics[]> {
    const out: PhpToolkitMetrics[] = [];
    try {
      let after: string | undefined;
      for (let page = 0; page < 10; page++) {
        const result = await this.storage.scan({
          prefix: STORAGE_PREFIX,
          limit: 200,
          ...(after ? { after } : {}),
        });
        for (const entry of result.entries ?? []) {
          if (entry.key === this.key) continue;
          out.push(deserialize(entry.value, { name: "", path: "" }));
        }
        after = result.next;
        if (!after) break;
      }
    } catch {
      // A missing cross-project view must never break the snapshot.
    }
    return out;
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, PERSIST_DEBOUNCE_MS);
    this.timer.unref?.();
  }
}

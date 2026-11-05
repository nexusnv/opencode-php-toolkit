import { createHash } from "node:crypto";

/**
 * Outcome of a single tool invocation.
 *
 * `ok` means "the tool performed its job"; `error` means "the tool could not
 * complete the work" (missing binary, timeout, a file it could not read).
 * Issues found in the user's code are *findings*, not errors - a lint that
 * finds a broken file is a successful lint.
 */
export type ToolRunStatus = "ok" | "error";

export type ToolMetricEntry = {
  /** Times the tool ran. */
  runs: number;
  /** Runs that produced a result. */
  ok: number;
  /** Runs that could not be completed. */
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

export interface EntryCounter {
  count: number;
  lastUsedAt: string;
}

export interface RoutingMetrics {
  selections: Record<string, EntryCounter>;
  activations: Record<string, EntryCounter>;
  unactivated: Record<string, number>;
  intents: Record<string, number>;
  concerns: Record<string, number>;
  dropped: Record<string, number>;
  taskGenerations: number;
  continuations: number;
  resets: number;
  announcements: number;
}

export interface VerificationMetrics {
  runs: number;
  passed: number;
  failed: number;
  warning: number;
  skipped: number;
  partial: number;
  unavailable: number;
  error: number;
  timedOut: number;
  cancelled: number;
  findings: number;
  lastRunAt: string | null;
}

export interface ScannerMetrics {
  runs: number;
  findings: number;
  hypotheses: number;
  truncated: number;
  cacheHits: number;
  cacheModes: { content: number; metadata: number };
  lastRunAt: string | null;
}

export interface PhpToolkitMetrics {
  version: number;
  startedAt: string;
  /** Basename of the project root - display only. */
  projectName: string;
  /** Absolute project root - identity of the document, never displayed. */
  projectPath: string;
  tools: Record<string, ToolMetricEntry>;
  commands: Record<string, CommandMetricEntry>;
  /** Prompts that mentioned the PHP ecosystem. */
  triggerHits: number;
  routing: RoutingMetrics;
  verification: VerificationMetrics;
  scanner: ScannerMetrics;
}

export type RoutingMetricEvent =
  | { kind: "selected"; skill: string }
  | { kind: "activated"; skill: string }
  | { kind: "unactivated"; skill: string }
  | { kind: "dropped"; reason: string }
  | { kind: "intents"; values: string[] }
  | { kind: "concerns"; values: string[] }
  | { kind: "task-generation" }
  | { kind: "continuation" }
  | { kind: "reset" };

export const METRICS_VERSION = 3;

export function emptyRoutingMetrics(): RoutingMetrics {
  return {
    selections: {},
    activations: {},
    unactivated: {},
    intents: {},
    concerns: {},
    dropped: {},
    taskGenerations: 0,
    continuations: 0,
    resets: 0,
    announcements: 0,
  };
}

export function emptyVerificationMetrics(): VerificationMetrics {
  return {
    runs: 0,
    passed: 0,
    failed: 0,
    warning: 0,
    skipped: 0,
    partial: 0,
    unavailable: 0,
    error: 0,
    timedOut: 0,
    cancelled: 0,
    findings: 0,
    lastRunAt: null,
  };
}

export function emptyScannerMetrics(): ScannerMetrics {
  return {
    runs: 0,
    findings: 0,
    hypotheses: 0,
    truncated: 0,
    cacheHits: 0,
    cacheModes: { content: 0, metadata: 0 },
    lastRunAt: null,
  };
}

/** Storage keys are `${STORAGE_PREFIX}${projectKey(path)}` - one doc per project. */
export const STORAGE_PREFIX = "php-toolkit.metrics.";

/** Key used by the first (machine-global) implementation, migrated on first read. */
export const LEGACY_STORAGE_KEY = "php-toolkit.metrics";

/** Upper bound on tracked tool/command names, so a corrupt doc cannot bloat. */
const MAX_ENTRIES = 200;

/** Writes are coalesced so a burst of tool calls costs one storage write. */
const PERSIST_DEBOUNCE_MS = 250;

/** Retries after a failed write, with a bounded number of attempts. */
const MAX_WRITE_RETRIES = 3;

export type MetricsProject = { name: string; path: string };

/**
 * Minimal structural storage contract used by the metrics store.
 * Matches OpenCode's local storage domain (async JSON key-value persistence).
 *
 * `set()` must be commit-or-reject: a call that persists the value *and*
 * rejects its promise is a contract violation - flush() would then re-apply
 * increments that already landed on the next retry. The backend also exposes
 * no compare-and-swap, so concurrent processes merge on read (last writer
 * wins for writes that overlap between the read and the write).
 */
export interface MetricsStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
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
    routing: emptyRoutingMetrics(),
    verification: emptyVerificationMetrics(),
    scanner: emptyScannerMetrics(),
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

function migrateCounters(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    out[name] = nonNegative(num(value));
    if (Object.keys(out).length >= MAX_ENTRIES) break;
  }
  return out;
}

function migrateEntryCounters(raw: unknown): Record<string, EntryCounter> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, EntryCounter> = {};
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

function migrateRouting(raw: unknown): RoutingMetrics {
  const base = emptyRoutingMetrics();
  if (!raw || typeof raw !== "object") return base;
  const candidate = raw as Record<string, unknown>;
  return {
    selections: migrateEntryCounters(candidate.selections),
    activations: migrateEntryCounters(candidate.activations),
    unactivated: migrateCounters(candidate.unactivated),
    intents: migrateCounters(candidate.intents),
    concerns: migrateCounters(candidate.concerns),
    dropped: migrateCounters(candidate.dropped),
    taskGenerations: nonNegative(num(candidate.taskGenerations)),
    continuations: nonNegative(num(candidate.continuations)),
    resets: nonNegative(num(candidate.resets)),
    announcements: nonNegative(num(candidate.announcements)),
  };
}

function migrateVerification(raw: unknown): VerificationMetrics {
  const base = emptyVerificationMetrics();
  if (!raw || typeof raw !== "object") return base;
  const candidate = raw as Record<string, unknown>;
  const result: VerificationMetrics = { ...base };
  for (const key of [
    "runs",
    "passed",
    "failed",
    "warning",
    "skipped",
    "partial",
    "unavailable",
    "error",
    "timedOut",
    "cancelled",
    "findings",
  ] as const) {
    result[key] = nonNegative(num(candidate[key]));
  }
  result.lastRunAt = typeof candidate.lastRunAt === "string" ? candidate.lastRunAt : null;
  return result;
}

function migrateScanner(raw: unknown): ScannerMetrics {
  const base = emptyScannerMetrics();
  if (!raw || typeof raw !== "object") return base;
  const candidate = raw as Record<string, unknown>;
  const modes =
    candidate.cacheModes && typeof candidate.cacheModes === "object"
      ? (candidate.cacheModes as Record<string, unknown>)
      : {};
  return {
    runs: nonNegative(num(candidate.runs)),
    findings: nonNegative(num(candidate.findings)),
    hypotheses: nonNegative(num(candidate.hypotheses)),
    truncated: nonNegative(num(candidate.truncated)),
    cacheHits: nonNegative(num(candidate.cacheHits)),
    cacheModes: {
      content: nonNegative(num(modes.content)),
      metadata: nonNegative(num(modes.metadata)),
    },
    lastRunAt: typeof candidate.lastRunAt === "string" ? candidate.lastRunAt : null,
  };
}

/**
 * Turns whatever is on disk into a valid document. Documents from a newer
 * format are reported as unsupported so the caller can refuse to write over
 * them; older versions are migrated forward.
 */
export function deserialize(
  raw: unknown,
  project: MetricsProject,
): { metrics: PhpToolkitMetrics; supported: boolean } {
  const base = initialMetrics(project);
  if (!raw || typeof raw !== "object") return { metrics: base, supported: true };
  const candidate = raw as Record<string, unknown>;
  const version = num(candidate.version) ?? 0;
  if (version > METRICS_VERSION) return { metrics: base, supported: false };
  return {
    supported: true,
    metrics: {
      version: METRICS_VERSION,
      startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : base.startedAt,
      projectName: typeof candidate.projectName === "string" ? candidate.projectName : project.name,
      projectPath: typeof candidate.projectPath === "string" ? candidate.projectPath : project.path,
      tools: migrateTools(candidate.tools),
      commands: migrateCommands(candidate.commands),
      triggerHits: nonNegative(num(candidate.triggerHits)),
      routing: migrateRouting(candidate.routing),
      verification: migrateVerification(candidate.verification),
      scanner: migrateScanner(candidate.scanner),
    },
  };
}

/** Pending increments that have not been persisted yet. */
export type MetricsDelta = {
  tools: Record<string, { runs: number; ok: number; error: number; findings: number; lastUsedAt: string; lastStatus: ToolRunStatus | null }>;
  commands: Record<string, { count: number; lastUsedAt: string }>;
  triggerHits: number;
  routing: RoutingMetrics;
};

function emptyDelta(): MetricsDelta {
  return { tools: {}, commands: {}, triggerHits: 0, routing: emptyRoutingMetrics() };
}

function isEmptyRouting(routing: RoutingMetrics): boolean {
  return (
    Object.keys(routing.selections).length === 0 &&
    Object.keys(routing.activations).length === 0 &&
    Object.keys(routing.unactivated).length === 0 &&
    Object.keys(routing.intents).length === 0 &&
    Object.keys(routing.concerns).length === 0 &&
    Object.keys(routing.dropped).length === 0 &&
    routing.taskGenerations === 0 &&
    routing.continuations === 0 &&
    routing.resets === 0 &&
    routing.announcements === 0
  );
}

function isEmptyDelta(delta: MetricsDelta): boolean {
  return (
    delta.triggerHits === 0 &&
    Object.keys(delta.tools).length === 0 &&
    Object.keys(delta.commands).length === 0 &&
    isEmptyRouting(delta.routing)
  );
}

function later<T extends { lastUsedAt: string }>(a: T, b: T): T {
  // Strictly greater: on a timestamp tie, b (the delta recorded later by
  // mergeDelta's caller) wins, so the newest status survives a merge.
  return a.lastUsedAt > b.lastUsedAt ? a : b;
}

function addCounters(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(a)) out[name] = value;
  for (const [name, value] of Object.entries(b)) out[name] = (out[name] ?? 0) + value;
  return out;
}

function addEntryCounters(
  a: Record<string, EntryCounter>,
  b: Record<string, EntryCounter>,
): Record<string, EntryCounter> {
  const out: Record<string, EntryCounter> = {};
  for (const [name, value] of Object.entries(a)) out[name] = { ...value };
  for (const [name, value] of Object.entries(b)) {
    const current = out[name];
    out[name] = current
      ? { count: current.count + value.count, lastUsedAt: later(current, value).lastUsedAt }
      : { ...value };
  }
  return out;
}

export function mergeRoutingMetrics(a: RoutingMetrics, b: RoutingMetrics): RoutingMetrics {
  return {
    selections: addEntryCounters(a.selections, b.selections),
    activations: addEntryCounters(a.activations, b.activations),
    unactivated: addCounters(a.unactivated, b.unactivated),
    intents: addCounters(a.intents, b.intents),
    concerns: addCounters(a.concerns, b.concerns),
    dropped: addCounters(a.dropped, b.dropped),
    taskGenerations: a.taskGenerations + b.taskGenerations,
    continuations: a.continuations + b.continuations,
    resets: a.resets + b.resets,
    announcements: a.announcements + b.announcements,
  };
}

function bumpCounter(target: Record<string, number>, key: string): void {
  if (target[key] !== undefined) {
    target[key] += 1;
    return;
  }
  if (Object.keys(target).length < MAX_ENTRIES) target[key] = 1;
}

function bumpEntryCounter(target: Record<string, EntryCounter>, key: string, now: string): void {
  const existing = target[key];
  if (existing) {
    existing.count += 1;
    existing.lastUsedAt = now;
    return;
  }
  if (Object.keys(target).length < MAX_ENTRIES) target[key] = { count: 1, lastUsedAt: now };
}

/** Applies one routing event to a counter document. */
export function applyRoutingEvent(
  target: RoutingMetrics,
  event: RoutingMetricEvent,
  now: string,
): void {
  switch (event.kind) {
    case "selected":
      bumpEntryCounter(target.selections, event.skill, now);
      break;
    case "activated":
      bumpEntryCounter(target.activations, event.skill, now);
      break;
    case "unactivated":
      bumpCounter(target.unactivated, event.skill);
      break;
    case "dropped":
      bumpCounter(target.dropped, event.reason);
      break;
    case "intents":
      for (const value of event.values) bumpCounter(target.intents, value);
      break;
    case "concerns":
      for (const value of event.values) bumpCounter(target.concerns, value);
      break;
    case "task-generation":
      target.taskGenerations += 1;
      break;
    case "continuation":
      target.continuations += 1;
      break;
    case "reset":
      target.resets += 1;
      break;
  }
}

/**
 * Combines two pending deltas, keeping every increment from both. Used when a
 * flush has to defer a write: increments recorded while that flush was in
 * flight must survive the retry, not be overwritten by it.
 */
export function mergeDelta(a: MetricsDelta, b: MetricsDelta): MetricsDelta {
  const tools: MetricsDelta["tools"] = {};
  for (const [name, e] of Object.entries(a.tools)) tools[name] = { ...e };
  for (const [name, e] of Object.entries(b.tools)) {
    const cur = tools[name];
    if (!cur) {
      tools[name] = { ...e };
      continue;
    }
    const last = later(cur, e);
    tools[name] = {
      runs: cur.runs + e.runs,
      ok: cur.ok + e.ok,
      error: cur.error + e.error,
      findings: cur.findings + e.findings,
      lastUsedAt: last.lastUsedAt,
      lastStatus: last.lastStatus ?? cur.lastStatus ?? e.lastStatus,
    };
  }
  const commands: MetricsDelta["commands"] = {};
  for (const [name, e] of Object.entries(a.commands)) commands[name] = { ...e };
  for (const [name, e] of Object.entries(b.commands)) {
    const cur = commands[name];
    if (!cur) {
      commands[name] = { ...e };
      continue;
    }
    commands[name] = {
      count: cur.count + e.count,
      lastUsedAt: later(cur, e).lastUsedAt,
    };
  }
  return {
    tools,
    commands,
    triggerHits: a.triggerHits + b.triggerHits,
    routing: mergeRoutingMetrics(a.routing, b.routing),
  };
}

/** Applies pending increments to a document, producing the merged view. */
function applyDelta(base: PhpToolkitMetrics, delta: MetricsDelta): PhpToolkitMetrics {
  const tools: Record<string, ToolMetricEntry> = {};
  for (const [name, entry] of Object.entries(base.tools)) {
    tools[name] = { ...entry };
  }
  for (const [name, entry] of Object.entries(delta.tools)) {
    const current = tools[name] ?? {
      runs: 0,
      ok: 0,
      error: 0,
      findings: 0,
      lastUsedAt: "",
      lastStatus: null,
    };
    tools[name] = {
      runs: current.runs + entry.runs,
      ok: current.ok + entry.ok,
      error: current.error + entry.error,
      findings: current.findings + entry.findings,
      lastUsedAt: entry.lastUsedAt || current.lastUsedAt,
      lastStatus: entry.lastStatus ?? current.lastStatus,
    };
  }
  const commands: Record<string, CommandMetricEntry> = {};
  for (const [name, entry] of Object.entries(base.commands)) {
    commands[name] = { ...entry };
  }
  for (const [name, entry] of Object.entries(delta.commands)) {
    const current = commands[name] ?? { count: 0, lastUsedAt: "" };
    commands[name] = {
      count: current.count + entry.count,
      lastUsedAt: entry.lastUsedAt || current.lastUsedAt,
    };
  }
  return {
    ...base,
    tools,
    commands,
    triggerHits: base.triggerHits + delta.triggerHits,
    routing: mergeRoutingMetrics(base.routing ?? emptyRoutingMetrics(), delta.routing),
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
 *
 * Writes merge pending increments into the latest stored document rather than
 * overwriting it, so two sessions on the same project do not lose each
 * other's counts. init/flush/reset run one at a time per store; across
 * processes, writes that overlap are last-writer-wins (the storage backend
 * has no compare-and-swap).
 */
export class MetricsStore {
  private base: PhpToolkitMetrics;
  private delta: MetricsDelta = emptyDelta();
  private readonly key: string;
  private writable = true;
  private wrote = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private reportedFailure = false;
  /** Tail of the operation chain; every state-mutating operation waits on it. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: MetricsStorage,
    private readonly project: MetricsProject,
  ) {
    this.base = initialMetrics(project);
    this.key = storageKeyFor(project.path);
  }

  /**
   * Runs `op` after every previously enqueued operation on this store has
   * settled (successfully or not). init/flush/reset are serialized this way,
   * so a reset can never interleave with a flush mid-write.
   */
  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(op, op);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Storage key this store owns. */
  get storageKey(): string {
    return this.key;
  }

  /** False when the stored document could not be read or is a newer format. */
  get canWrite(): boolean {
    return this.writable;
  }

  /**
   * Loads the stored document.
   *
   * Throws only if the storage itself fails. The caller decides whether that
   * is fatal (it must not be) - but the store refuses to write afterwards so
   * a failed read can never erase the history that is still on disk.
   */
  async init(): Promise<void> {
    return this.enqueue(() => this.initNow());
  }

  private async initNow(): Promise<void> {
    let raw: unknown;
    try {
      raw = await this.storage.get(this.key);
    } catch (err) {
      this.writable = false;
      throw err;
    }
    const loaded = deserialize(raw, this.project);
    if (!loaded.supported) {
      // A newer format owns this document - do not overwrite it.
      this.writable = false;
      return;
    }
    // A write that already happened merged the latest document itself; do not
    // replace it with the (now stale) copy read above.
    if (!this.wrote) this.base = loaded.metrics;
    if (raw === undefined && !this.wrote) {
      await this.adoptLegacyDocument();
    }
  }

  /** The current view: persisted document plus everything not yet written. */
  getSnapshot(): PhpToolkitMetrics {
    return applyDelta(this.base, this.delta);
  }

  async recordTool(input: { tool: string; status: ToolRunStatus; findings?: number }): Promise<void> {
    const now = new Date().toISOString();
    const entry = this.delta.tools[input.tool] ?? {
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
    entry.lastUsedAt = now;
    entry.lastStatus = input.status;
    this.delta.tools[input.tool] = entry;
    this.markDirty();
  }

  async recordCommand(input: { name: string }): Promise<void> {
    const now = new Date().toISOString();
    const entry = this.delta.commands[input.name] ?? { count: 0, lastUsedAt: "" };
    entry.count += 1;
    entry.lastUsedAt = now;
    this.delta.commands[input.name] = entry;
    this.markDirty();
  }

  async recordTrigger(): Promise<void> {
    this.delta.triggerHits += 1;
    this.markDirty();
  }

  async recordRouting(event: RoutingMetricEvent): Promise<void> {
    applyRoutingEvent(this.delta.routing, event, new Date().toISOString());
    this.markDirty();
  }

  /**
   * Persists pending changes.
   *
   * Writes are coalesced, so a burst of tool calls costs a single storage
   * write. The write merges the pending increments into the document that is
   * on disk right now, so a concurrent session's counts are not lost. When
   * the document cannot be re-read, or is from a newer format, the write is
   * skipped instead of overwriting counts this session cannot see; anything
   * recorded in the meantime stays pending.
   *
   * Operations are serialized per store (see `enqueue`), so a reset cannot
   * interleave with a flush. Concurrent OpenCode *processes* still merge on
   * read: writes that land between the read and the write of another process
   * are last-writer-wins, because the storage backend offers no compare-and-
   * swap.
   */
  async flush(): Promise<void> {
    return this.enqueue(() => this.flushNow());
  }

  private async flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (!this.writable) {
      if (!isEmptyDelta(this.delta)) {
        this.reportFailure("metrics storage is not writable; changes were dropped");
      }
      return;
    }
    if (isEmptyDelta(this.delta)) return;

    const pending = this.delta;
    this.delta = emptyDelta();
    // Read the latest document first so a concurrent writer's counts survive.
    // If the document cannot be read — or belongs to a newer format — the
    // write is skipped rather than overwriting counts we cannot see.
    let latest: PhpToolkitMetrics;
    try {
      const raw = await this.storage.get(this.key);
      const loaded = deserialize(raw, this.project);
      if (!loaded.supported) {
        // A newer format owns this document - do not overwrite it. Same rule
        // as init(): this store refuses to write what it cannot read.
        this.writable = false;
        this.reportFailure(
          "metrics write skipped: stored document is from a newer format; this session is read-only for the rest of its lifetime",
        );
        this.delta = mergeDelta(pending, this.delta);
        return;
      }
      latest = loaded.metrics;
    } catch {
      // Could not confirm the latest document - keep everything pending and
      // retry later instead of overwriting counts we cannot see.
      this.delta = mergeDelta(pending, this.delta);
      this.scheduleRetry();
      return;
    }
    try {
      const merged = applyDelta(latest, pending);
      await this.storage.set(this.key, merged);
      this.base = merged;
      this.wrote = true;
      this.retries = 0;
      this.reportedFailure = false;
    } catch {
      // Keep the change pending so the next flush retries it. Increments
      // recorded while this flush was in flight survive the retry too.
      this.delta = mergeDelta(pending, this.delta);
      this.scheduleRetry();
    }
  }

  /** Documents of the other projects tracked on this machine. */
  async listOtherProjects(): Promise<{
    projects: PhpToolkitMetrics[];
    /** True when the scan stopped before reaching the end of the prefix. */
    truncated: boolean;
    /** True when the scan itself failed. */
    failed: boolean;
  }> {
    const projects: PhpToolkitMetrics[] = [];
    try {
      let after: string | undefined;
      for (let page = 0; page < 100; page++) {
        const result = await this.storage.scan({
          prefix: STORAGE_PREFIX,
          limit: 200,
          ...(after ? { after } : {}),
        });
        for (const entry of result.entries ?? []) {
          if (entry.key === this.key) continue;
          const loaded = deserialize(entry.value, { name: "", path: "" });
          if (loaded.supported) projects.push(loaded.metrics);
        }
        after = result.next;
        if (!after) return { projects, truncated: false, failed: false };
      }
      return { projects, truncated: true, failed: false };
    } catch {
      // A missing cross-project view must never break the snapshot.
      return { projects: [], truncated: false, failed: true };
    }
  }

  /**
   * Picks up the document written by the first (machine-global) implementation
   * so upgrading does not lose the history a user already had.
   */
  private async adoptLegacyDocument(): Promise<void> {
    try {
      const raw = await this.storage.get(LEGACY_STORAGE_KEY);
      if (raw === undefined) return;
      const legacy = deserialize(raw, this.project);
      if (!legacy.supported) return;
      const hasHistory =
        legacy.metrics.triggerHits > 0 ||
        Object.keys(legacy.metrics.tools).length > 0 ||
        Object.keys(legacy.metrics.commands).length > 0;
      if (!hasHistory) return;
      this.base = legacy.metrics;
      // Claim it: only one project adopts the machine-global history.
      await this.storage.remove(LEGACY_STORAGE_KEY).catch(() => {});
    } catch {
      // No legacy document, or it cannot be read - nothing to migrate.
    }
  }

  /**
   * Clears this project's persisted document and starts over with an empty
   * one. Pending increments are discarded too - this is a full wipe, used by
   * `php_metrics` when the user explicitly asks for it.
   *
   * An empty document is written (not the key removed) so the legacy
   * machine-global document can never be re-adopted for this project on the
   * next startup. The reset runs after any in-flight flush (see `enqueue`),
   * so a pre-reset write cannot land after the wipe; a concurrent *process*
   * can still write pre-reset counts in a narrow window - run the reset
   * again if that matters.
   */
  async reset(): Promise<boolean> {
    return this.enqueue(() => this.resetNow());
  }

  private async resetNow(): Promise<boolean> {
    try {
      await this.storage.set(this.key, initialMetrics(this.project));
    } catch {
      return false;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.base = initialMetrics(this.project);
    this.delta = emptyDelta();
    this.wrote = true;
    this.retries = 0;
    this.writable = true;
    // A failed write before the reset must not silence the next failure log.
    this.reportedFailure = false;
    return true;
  }

  private markDirty(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, PERSIST_DEBOUNCE_MS);
    this.timer.unref?.();
  }

  private scheduleRetry(): void {
    if (this.retries >= MAX_WRITE_RETRIES) {
      this.reportFailure("metrics could not be persisted after several attempts");
      return;
    }
    const delay = 1000 * 2 ** this.retries;
    this.retries += 1;
    this.reportFailure(`metrics write failed; retrying in ${delay}ms`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
    this.retryTimer.unref?.();
  }

  private reportFailure(message: string): void {
    if (this.reportedFailure) return;
    this.reportedFailure = true;
    console.error(`[php-toolkit] ${message}`);
  }
}

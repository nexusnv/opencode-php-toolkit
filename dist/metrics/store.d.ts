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
    cacheModes: {
        content: number;
        metadata: number;
    };
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
/**
 * Routing metrics events. `task-generation` fires for every boundary that
 * starts a new task; `reset` only for explicit task switches; `continuation`
 * for any (ambiguous) continuation.
 */
export type RoutingMetricEvent = {
    kind: "selected";
    skill: string;
} | {
    kind: "activated";
    skill: string;
} | {
    kind: "unactivated";
    skill: string;
} | {
    kind: "dropped";
    reason: string;
} | {
    kind: "intents";
    values: string[];
} | {
    kind: "concerns";
    values: string[];
} | {
    kind: "task-generation";
} | {
    kind: "continuation";
} | {
    kind: "reset";
};
export declare const METRICS_VERSION = 3;
export declare function emptyRoutingMetrics(): RoutingMetrics;
export declare function emptyVerificationMetrics(): VerificationMetrics;
export declare function emptyScannerMetrics(): ScannerMetrics;
/** Storage keys are `${STORAGE_PREFIX}${projectKey(path)}` - one doc per project. */
export declare const STORAGE_PREFIX = "php-toolkit.metrics.";
/** Key used by the first (machine-global) implementation, migrated on first read. */
export declare const LEGACY_STORAGE_KEY = "php-toolkit.metrics";
export type MetricsProject = {
    name: string;
    path: string;
};
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
    scan(options: {
        prefix: string;
        after?: string;
        limit?: number;
    }): Promise<{
        entries: ReadonlyArray<{
            key: string;
            value: unknown;
        }>;
        next?: string;
    }>;
}
/** Stable, filesystem-safe identifier for a project root. */
export declare function projectKey(path: string): string;
export declare function storageKeyFor(path: string): string;
/**
 * Turns whatever is on disk into a valid document. Documents from a newer
 * format are reported as unsupported so the caller can refuse to write over
 * them; older versions are migrated forward.
 */
export declare function deserialize(raw: unknown, project: MetricsProject): {
    metrics: PhpToolkitMetrics;
    supported: boolean;
};
/** Pending increments that have not been persisted yet. */
export type MetricsDelta = {
    tools: Record<string, {
        runs: number;
        ok: number;
        error: number;
        findings: number;
        lastUsedAt: string;
        lastStatus: ToolRunStatus | null;
    }>;
    commands: Record<string, {
        count: number;
        lastUsedAt: string;
    }>;
    triggerHits: number;
    routing: RoutingMetrics;
};
export declare function mergeRoutingMetrics(a: RoutingMetrics, b: RoutingMetrics): RoutingMetrics;
/** Applies one routing event to a counter document. */
export declare function applyRoutingEvent(target: RoutingMetrics, event: RoutingMetricEvent, now: string): void;
/**
 * Combines two pending deltas, keeping every increment from both. Used when a
 * flush has to defer a write: increments recorded while that flush was in
 * flight must survive the retry, not be overwritten by it.
 */
export declare function mergeDelta(a: MetricsDelta, b: MetricsDelta): MetricsDelta;
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
export declare class MetricsStore {
    private readonly storage;
    private readonly project;
    private base;
    private delta;
    private readonly key;
    private writable;
    private wrote;
    private timer;
    private retryTimer;
    private retries;
    private reportedFailure;
    /** Tail of the operation chain; every state-mutating operation waits on it. */
    private queue;
    constructor(storage: MetricsStorage, project: MetricsProject);
    /**
     * Runs `op` after every previously enqueued operation on this store has
     * settled (successfully or not). init/flush/reset are serialized this way,
     * so a reset can never interleave with a flush mid-write.
     */
    private enqueue;
    /** Storage key this store owns. */
    get storageKey(): string;
    /** False when the stored document could not be read or is a newer format. */
    get canWrite(): boolean;
    /**
     * Loads the stored document.
     *
     * Throws only if the storage itself fails. The caller decides whether that
     * is fatal (it must not be) - but the store refuses to write afterwards so
     * a failed read can never erase the history that is still on disk.
     */
    init(): Promise<void>;
    private initNow;
    /** The current view: persisted document plus everything not yet written. */
    getSnapshot(): PhpToolkitMetrics;
    recordTool(input: {
        tool: string;
        status: ToolRunStatus;
        findings?: number;
    }): Promise<void>;
    recordCommand(input: {
        name: string;
    }): Promise<void>;
    recordTrigger(): Promise<void>;
    recordRouting(event: RoutingMetricEvent): Promise<void>;
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
    flush(): Promise<void>;
    private flushNow;
    /** Documents of the other projects tracked on this machine. */
    listOtherProjects(): Promise<{
        projects: PhpToolkitMetrics[];
        /** True when the scan stopped before reaching the end of the prefix. */
        truncated: boolean;
        /** True when the scan itself failed. */
        failed: boolean;
    }>;
    /**
     * Picks up the document written by the first (machine-global) implementation
     * so upgrading does not lose the history a user already had.
     */
    private adoptLegacyDocument;
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
    reset(): Promise<boolean>;
    private resetNow;
    private markDirty;
    private scheduleRetry;
    private reportFailure;
}

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
export type PhpToolkitMetrics = {
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
};
export declare const METRICS_VERSION = 2;
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
 * other's counts.
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
    constructor(storage: MetricsStorage, project: MetricsProject);
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
    /**
     * Persists pending changes.
     *
     * Writes are coalesced, so a burst of tool calls costs a single storage
     * write. The write merges the pending increments into the document that is
     * on disk right now, so a concurrent session's counts are not lost.
     */
    flush(): Promise<void>;
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
    private markDirty;
    private scheduleRetry;
    private reportFailure;
}

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
export declare const METRICS_VERSION = 2;
/** Storage keys are `${STORAGE_PREFIX}${projectKey(path)}` - one doc per project. */
export declare const STORAGE_PREFIX = "php-toolkit.metrics.";
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
 * Turns whatever is on disk into a valid document. Unknown future versions are
 * discarded rather than misread; older versions are migrated forward.
 */
export declare function deserialize(raw: unknown, project: MetricsProject): PhpToolkitMetrics;
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
export declare class MetricsStore {
    private readonly storage;
    private readonly project;
    private doc;
    private readonly key;
    private dirty;
    private timer;
    constructor(storage: MetricsStorage, project: MetricsProject);
    /** Storage key this store owns. */
    get storageKey(): string;
    /**
     * Loads the stored document. Throws only if the storage itself fails; the
     * caller decides whether that is fatal (it must not be).
     */
    init(): Promise<void>;
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
     * Persists pending changes. Writes are coalesced, so a burst of tool calls
     * costs a single storage write instead of one per event.
     */
    flush(): Promise<void>;
    /** Documents of the other projects tracked on this machine. */
    listOtherProjects(): Promise<PhpToolkitMetrics[]>;
    private markDirty;
}

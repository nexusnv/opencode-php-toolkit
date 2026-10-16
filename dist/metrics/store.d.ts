export type ToolRunStatus = "ok" | "error";
export type ToolMetricEntry = {
    count: number;
    okCount: number;
    errorCount: number;
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
    tools: Record<string, ToolMetricEntry>;
    commands: Record<string, CommandMetricEntry>;
    triggerHits: number;
};
export declare const formatMetricsSnapshot: (m: PhpToolkitMetrics) => string;
/**
 * Minimal structural storage contract used by the metrics store.
 * Matches OpenCode's local storage domain (async JSON key-value persistence).
 */
export interface MetricsStorage {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
}
/**
 * Local-only usage + outcome metrics collector for the PHP toolkit.
 *
 * Persists through OpenCode's local storage domain and never emits anything
 * over the network — all data stays inside the user's local environment.
 */
export declare class MetricsStore {
    private readonly storage;
    private doc;
    constructor(storage: MetricsStorage);
    init(): Promise<void>;
    getSnapshot(): PhpToolkitMetrics;
    recordTool(input: {
        tool: string;
        status: ToolRunStatus;
    }): Promise<void>;
    recordCommand(input: {
        name: string;
    }): Promise<void>;
    recordTrigger(): Promise<void>;
    private persist;
    private deserialize;
}

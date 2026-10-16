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

export const formatMetricsSnapshot = (m: PhpToolkitMetrics): string => {
  const toolLines = Object.entries(m.tools)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, e]) => {
      const okRate = e.count > 0 ? Math.round((e.okCount / e.count) * 100) : 0;
      const lastStatus = e.lastStatus === null ? "n/a" : e.lastStatus;
      return `  - ${name}: ${e.count} run(s), ${e.okCount} ok / ${e.errorCount} error (~${okRate}% ok) [last: ${lastStatus}]`;
    });
  const commandLines = Object.entries(m.commands)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, e]) => `  - ${name}: ${e.count} invocation(s)`);
  return [
    `PHP toolkit metrics (local-only):`,
    `  Started tracking: ${m.startedAt}`,
    `  PHP prompt trigger hits: ${m.triggerHits}`,
    `  Tools:`,
    toolLines.length > 0 ? toolLines.join("\n") : "    (none)",
    `  Commands:`,
    commandLines.length > 0 ? commandLines.join("\n") : "    (none)",
  ].join("\n");
};

const STORAGE_KEY = "php-toolkit.metrics";
const METRICS_VERSION = 1;

/**
 * Minimal structural storage contract used by the metrics store.
 * Matches OpenCode's local storage domain (async JSON key-value persistence).
 */
export interface MetricsStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

const initialMetrics = (): PhpToolkitMetrics => ({
  version: METRICS_VERSION,
  startedAt: new Date().toISOString(),
  tools: {},
  commands: {},
  triggerHits: 0,
});

/**
 * Local-only usage + outcome metrics collector for the PHP toolkit.
 *
 * Persists through OpenCode's local storage domain and never emits anything
 * over the network — all data stays inside the user's local environment.
 */
export class MetricsStore {
  private doc: PhpToolkitMetrics;

  constructor(private readonly storage: MetricsStorage) {
    this.doc = initialMetrics();
  }

  async init(): Promise<void> {
    const raw = await this.storage.get(STORAGE_KEY).catch(() => undefined);
    this.doc = this.deserialize(raw);
  }

  getSnapshot(): PhpToolkitMetrics {
    return this.doc;
  }

  async recordTool(input: { tool: string; status: ToolRunStatus }): Promise<void> {
    const entry: ToolMetricEntry = this.doc.tools[input.tool] ?? {
      count: 0,
      okCount: 0,
      errorCount: 0,
      lastUsedAt: "",
      lastStatus: null,
    };
    entry.count += 1;
    if (input.status === "ok") {
      entry.okCount += 1;
    } else {
      entry.errorCount += 1;
    }
    entry.lastUsedAt = new Date().toISOString();
    entry.lastStatus = input.status;
    this.doc.tools[input.tool] = entry;
    await this.persist();
  }

  async recordCommand(input: { name: string }): Promise<void> {
    const entry: CommandMetricEntry = this.doc.commands[input.name] ?? { count: 0, lastUsedAt: "" };
    entry.count += 1;
    entry.lastUsedAt = new Date().toISOString();
    this.doc.commands[input.name] = entry;
    await this.persist();
  }

  async recordTrigger(): Promise<void> {
    this.doc.triggerHits += 1;
    await this.persist();
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEY, this.doc);
    } catch {
      // Metrics are best-effort: a storage failure must never break the plugin.
    }
  }

  private deserialize(raw: unknown): PhpToolkitMetrics {
    if (!raw || typeof raw !== "object") {
      return initialMetrics();
    }
    const candidate = raw as Partial<PhpToolkitMetrics>;
    if (candidate.version !== METRICS_VERSION) {
      return initialMetrics();
    }
    return {
      version: METRICS_VERSION,
      startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : new Date().toISOString(),
      tools: candidate.tools && typeof candidate.tools === "object" ? candidate.tools : {},
      commands: candidate.commands && typeof candidate.commands === "object" ? candidate.commands : {},
      triggerHits: typeof candidate.triggerHits === "number" ? candidate.triggerHits : 0,
    };
  }
}

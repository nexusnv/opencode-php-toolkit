import { describe, expect, it, vi } from "vitest";
import {
  LEGACY_STORAGE_KEY,
  MetricsStore,
  deserialize,
  projectKey,
  storageKeyFor,
  type MetricsStorage,
} from "../src/metrics/store.js";

function fakeStorage(seed: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(seed));
  const get = vi.fn(async (key: string) => data.get(key));
  const set = vi.fn(async (key: string, value: unknown) => {
    data.set(key, value);
  });
  const remove = vi.fn(async (key: string) => {
    data.delete(key);
  });
  const scan = vi.fn(async (options: { prefix: string; after?: string }) => {
    const tuples = [...data.entries()]
      .filter(([key]) => key.startsWith(options.prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const after = options.after;
    const start = after ? tuples.findIndex(([key]) => key > after) : 0;
    const page = tuples.slice(start === -1 ? tuples.length : start);
    return { entries: page.map(([key, value]) => ({ key, value })) };
  });
  const storage: MetricsStorage = { get, set, remove, scan };
  return { storage, data, get, set, remove, scan };
}

const PROJECT = { name: "my-app", path: "/home/dev/my-app" };

describe("project scoping", () => {
  it("gives every project root its own storage key", () => {
    expect(storageKeyFor("/a")).not.toBe(storageKeyFor("/b"));
    expect(storageKeyFor("/a")).toBe(storageKeyFor("/a"));
    expect(storageKeyFor("/a")).toContain("php-toolkit.metrics.");
  });

  it("hashes the path rather than embedding it", () => {
    expect(projectKey("/home/dev/my-app")).not.toContain("my-app");
    expect(projectKey("/home/dev/my-app")).toHaveLength(12);
  });
});

describe("deserialize", () => {
  it("returns defaults for missing or non-object data", () => {
    for (const raw of [undefined, null, "nope", 42, []]) {
      const { metrics, supported } = deserialize(raw, PROJECT);
      expect(supported).toBe(true);
      expect(metrics.version).toBe(2);
      expect(metrics.tools).toEqual({});
      expect(metrics.commands).toEqual({});
      expect(metrics.triggerHits).toBe(0);
      expect(metrics.projectName).toBe("my-app");
    }
  });

  it("keeps a current document", () => {
    const { metrics } = deserialize(
      {
        version: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        projectName: "my-app",
        projectPath: "/home/dev/my-app",
        triggerHits: 7,
        tools: { php_lint: { runs: 3, ok: 3, error: 0, findings: 2, lastUsedAt: "x", lastStatus: "ok" } },
        commands: { "php-review": { count: 2, lastUsedAt: "y" } },
      },
      PROJECT,
    );
    expect(metrics.triggerHits).toBe(7);
    expect(metrics.tools.php_lint.findings).toBe(2);
    expect(metrics.tools.php_lint.runs).toBe(3);
    expect(metrics.commands["php-review"].count).toBe(2);
  });

  it("migrates the v1 shape forward instead of discarding it", () => {
    const { metrics, supported } = deserialize(
      {
        version: 1,
        startedAt: "2026-01-01T00:00:00.000Z",
        triggerHits: 4,
        tools: {
          php_lint: { count: 5, okCount: 4, errorCount: 1, lastUsedAt: "x", lastStatus: "error" },
        },
        commands: { "php-review": { count: 1, lastUsedAt: "y" } },
      },
      PROJECT,
    );
    expect(supported).toBe(true);
    expect(metrics.version).toBe(2);
    expect(metrics.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(metrics.triggerHits).toBe(4);
    expect(metrics.tools.php_lint).toEqual({
      runs: 5,
      ok: 4,
      error: 1,
      findings: 0,
      lastUsedAt: "x",
      lastStatus: "error",
    });
    expect(metrics.commands["php-review"].count).toBe(1);
  });

  it("marks a document from a newer format as unsupported", () => {
    const { supported } = deserialize({ version: 99, triggerHits: 12 }, PROJECT);
    expect(supported).toBe(false);
  });

  it("drops corrupt entries instead of producing NaN counters", () => {
    const { metrics } = deserialize(
      {
        version: 2,
        triggerHits: "not a number",
        tools: {
          good: { runs: 2, ok: 2, error: 0, findings: 1, lastUsedAt: "x", lastStatus: "ok" },
          bad: "garbage",
          partial: { runs: "x", ok: null },
        },
        commands: { broken: 7 },
      },
      PROJECT,
    );
    expect(metrics.triggerHits).toBe(0);
    expect(metrics.tools.good.findings).toBe(1);
    expect(metrics.tools.bad).toBeUndefined();
    expect(metrics.tools.partial.runs).toBe(0);
    expect(metrics.tools.partial.ok).toBe(0);
    expect(Number.isNaN(metrics.tools.partial.runs)).toBe(false);
    expect(metrics.commands.broken).toBeUndefined();
  });
});

describe("MetricsStore", () => {
  it("starts empty and loads nothing when storage has no document", async () => {
    const { storage } = fakeStorage();
    const store = new MetricsStore(storage, PROJECT);
    await store.init();
    const snap = store.getSnapshot();
    expect(snap.tools).toEqual({});
    expect(snap.commands).toEqual({});
    expect(snap.triggerHits).toBe(0);
    expect(snap.projectPath).toBe("/home/dev/my-app");
  });

  it("counts tool runs by outcome and findings", async () => {
    const { storage } = fakeStorage();
    const store = new MetricsStore(storage, PROJECT);
    await store.init();

    await store.recordTool({ tool: "php_lint", status: "ok", findings: 2 });
    await store.recordTool({ tool: "php_lint", status: "ok", findings: 1 });
    await store.recordTool({ tool: "php_lint", status: "error" });
    await store.recordTool({ tool: "php_project_detect", status: "ok" });

    const tools = store.getSnapshot().tools;
    expect(tools.php_lint.runs).toBe(3);
    expect(tools.php_lint.ok).toBe(2);
    expect(tools.php_lint.error).toBe(1);
    expect(tools.php_lint.findings).toBe(3);
    expect(tools.php_lint.lastStatus).toBe("error");
    expect(tools.php_project_detect.findings).toBe(0);
    expect(tools.php_project_detect.runs).toBe(1);
  });

  it("counts commands and prompt triggers", async () => {
    const { storage } = fakeStorage();
    const store = new MetricsStore(storage, PROJECT);
    await store.init();

    await store.recordCommand({ name: "php-review" });
    await store.recordCommand({ name: "php-review" });
    await store.recordTrigger();

    const snap = store.getSnapshot();
    expect(snap.commands["php-review"].count).toBe(2);
    expect(snap.triggerHits).toBe(1);
  });

  it("persists under the project-scoped key", async () => {
    const { storage, data } = fakeStorage();
    const store = new MetricsStore(storage, PROJECT);
    await store.init();
    await store.recordTrigger();
    await store.flush();

    const key = storageKeyFor("/home/dev/my-app");
    expect(data.has(key)).toBe(true);
    expect((data.get(key) as { triggerHits: number }).triggerHits).toBe(1);
  });

  it("coalesces a burst of events into a single write", async () => {
    const { storage, set } = fakeStorage();
    const store = new MetricsStore(storage, PROJECT);
    await store.init();

    await store.recordTrigger();
    await store.recordTrigger();
    await store.recordCommand({ name: "php-review" });
    expect(set).not.toHaveBeenCalled();

    await store.flush();
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("writes on its own once the debounce window elapses", async () => {
    vi.useFakeTimers();
    try {
      const { storage, set } = fakeStorage();
      const store = new MetricsStore(storage, PROJECT);
      await store.init();

      await store.recordTrigger();
      await vi.advanceTimersByTimeAsync(300);
      expect(set).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not write when nothing changed", async () => {
    const { storage, set } = fakeStorage();
    const store = new MetricsStore(storage, PROJECT);
    await store.init();
    await store.flush();
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps changes pending when the write fails", async () => {
    const { storage, set } = fakeStorage();
    const store = new MetricsStore(storage, PROJECT);
    await store.init();

    set.mockRejectedValueOnce(new Error("read-only filesystem"));
    await store.recordTrigger();
    await store.flush();
    expect(set).toHaveBeenCalledTimes(1);

    // The change is still pending, so the next flush retries it.
    await store.flush();
    expect(set).toHaveBeenCalledTimes(2);
  });

  it("never overwrites the stored document when the read failed", async () => {
    const { storage, set, data } = fakeStorage({
      [storageKeyFor(PROJECT.path)]: { version: 2, triggerHits: 9, tools: {}, commands: {} },
    });
    const store = new MetricsStore(storage, PROJECT);
    storage.get = async () => {
      throw new Error("disk on fire");
    };
    await expect(store.init()).rejects.toThrow("disk on fire");
    expect(store.canWrite).toBe(false);

    await store.recordTrigger();
    await store.flush();

    // The document that is on disk is untouched.
    expect(set).not.toHaveBeenCalled();
    expect((data.get(storageKeyFor(PROJECT.path)) as { triggerHits: number }).triggerHits).toBe(9);
  });

  it("never overwrites a document written by a newer format", async () => {
    const key = storageKeyFor(PROJECT.path);
    const { storage, set, data } = fakeStorage({ [key]: { version: 99, triggerHits: 4 } });
    const store = new MetricsStore(storage, PROJECT);
    await store.init();
    expect(store.canWrite).toBe(false);

    await store.recordTrigger();
    await store.flush();

    expect(set).not.toHaveBeenCalled();
    expect((data.get(key) as { version: number }).version).toBe(99);
  });

  it("merges concurrent updates instead of overwriting them", async () => {
    const { storage, data } = fakeStorage();
    const first = new MetricsStore(storage, PROJECT);
    const second = new MetricsStore(storage, PROJECT);
    await first.init();
    await second.init();

    await first.recordTrigger();
    await second.recordCommand({ name: "php-review" });
    await first.flush();
    await second.flush();

    const stored = data.get(storageKeyFor(PROJECT.path)) as {
      triggerHits: number;
      commands: Record<string, { count: number }>;
    };
    expect(stored.triggerHits).toBe(1);
    expect(stored.commands["php-review"].count).toBe(1);
  });

  it("adopts the machine-global document left by the first implementation", async () => {
    const { storage, data, remove } = fakeStorage({
      [LEGACY_STORAGE_KEY]: {
        version: 1,
        startedAt: "2026-01-01T00:00:00.000Z",
        triggerHits: 3,
        tools: { php_lint: { count: 2, okCount: 2, errorCount: 0 } },
        commands: {},
      },
    });
    const store = new MetricsStore(storage, PROJECT);
    await store.init();

    const snap = store.getSnapshot();
    expect(snap.triggerHits).toBe(3);
    expect(snap.tools.php_lint.runs).toBe(2);
    // The legacy document is claimed, so a second project does not adopt it too.
    expect(remove).toHaveBeenCalledWith(LEGACY_STORAGE_KEY);
    expect(data.has(LEGACY_STORAGE_KEY)).toBe(false);
  });

  it("leaves the legacy document alone when the project already has one", async () => {
    const { storage, remove } = fakeStorage({
      [LEGACY_STORAGE_KEY]: { version: 1, triggerHits: 3 },
      [storageKeyFor(PROJECT.path)]: { version: 2, triggerHits: 1, tools: {}, commands: {} },
    });
    const store = new MetricsStore(storage, PROJECT);
    await store.init();
    expect(remove).not.toHaveBeenCalled();
    expect(store.getSnapshot().triggerHits).toBe(1);
  });

  it("lists the other projects but not itself", async () => {
    const own = storageKeyFor(PROJECT.path);
    const other = storageKeyFor("/home/dev/other-app");
    const { storage } = fakeStorage({
      [own]: { version: 2, triggerHits: 5, tools: {}, commands: {}, projectName: "my-app" },
      [other]: {
        version: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        projectName: "other-app",
        projectPath: "/home/dev/other-app",
        tools: { php_lint: { runs: 4, ok: 4, error: 0, findings: 3, lastUsedAt: "x", lastStatus: "ok" } },
        commands: {},
        triggerHits: 2,
      },
    });
    const store = new MetricsStore(storage, PROJECT);
    await store.init();

    const result = await store.listOtherProjects();
    expect(result.failed).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].projectName).toBe("other-app");
    expect(result.projects[0].tools.php_lint.findings).toBe(3);
  });

  it("reports a failed scan instead of an empty result", async () => {
    const { storage } = fakeStorage();
    storage.scan = async () => {
      throw new Error("scan unsupported");
    };
    const store = new MetricsStore(storage, PROJECT);
    await store.init();
    const result = await store.listOtherProjects();
    expect(result.failed).toBe(true);
    expect(result.projects).toEqual([]);
  });

  it("follows every page of the scan", async () => {
    const { storage } = fakeStorage();
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 450; i++) {
      many[storageKeyFor(`/home/dev/p${i}`)] = {
        version: 2,
        projectName: `p${i}`,
        tools: {},
        commands: {},
        triggerHits: i,
      };
    }
    const paged = fakeStorage(many);
    let calls = 0;
    paged.storage.scan = async (options) => {
      const entries = [...paged.data.entries()]
        .filter(([key]) => key.startsWith(options.prefix))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => ({ key, value }));
      const index = calls;
      calls += 1;
      const page = entries.slice(index * 200, (index + 1) * 200);
      const next = (index + 1) * 200 < entries.length ? `page-${index}` : undefined;
      return { entries: page, next };
    };
    const store = new MetricsStore(paged.storage, PROJECT);
    await store.init();
    const result = await store.listOtherProjects();
    expect(result.truncated).toBe(false);
    expect(result.projects.length).toBe(450);
  });
});

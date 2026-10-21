import { describe, expect, it, vi } from "vitest";
import {
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
  const scan = vi.fn(async (options: { prefix: string }) => ({
    entries: [...data.entries()]
      .filter(([key]) => key.startsWith(options.prefix))
      .map(([key, value]) => ({ key, value })),
  }));
  const storage: MetricsStorage = { get, set, scan };
  return { storage, data, get, set, scan };
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
      const doc = deserialize(raw, PROJECT);
      expect(doc.version).toBe(2);
      expect(doc.tools).toEqual({});
      expect(doc.commands).toEqual({});
      expect(doc.triggerHits).toBe(0);
      expect(doc.projectName).toBe("my-app");
    }
  });

  it("keeps a current document", () => {
    const doc = deserialize(
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
    expect(doc.triggerHits).toBe(7);
    expect(doc.tools.php_lint.findings).toBe(2);
    expect(doc.tools.php_lint.runs).toBe(3);
    expect(doc.commands["php-review"].count).toBe(2);
  });

  it("migrates the v1 shape forward instead of discarding it", () => {
    const doc = deserialize(
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
    expect(doc.version).toBe(2);
    expect(doc.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(doc.triggerHits).toBe(4);
    expect(doc.tools.php_lint).toEqual({
      runs: 5,
      ok: 4,
      error: 1,
      findings: 0,
      lastUsedAt: "x",
      lastStatus: "error",
    });
    expect(doc.commands["php-review"].count).toBe(1);
  });

  it("discards documents from a newer format rather than misreading them", () => {
    const doc = deserialize({ version: 99, triggerHits: 12, tools: { php_lint: { runs: 3 } } }, PROJECT);
    expect(doc.triggerHits).toBe(0);
    expect(doc.tools).toEqual({});
  });

  it("drops corrupt entries instead of producing NaN counters", () => {
    const doc = deserialize(
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
    expect(doc.triggerHits).toBe(0);
    expect(doc.tools.good.findings).toBe(1);
    expect(doc.tools.bad).toBeUndefined();
    expect(doc.tools.partial.runs).toBe(0);
    expect(doc.tools.partial.ok).toBe(0);
    expect(Number.isNaN(doc.tools.partial.runs)).toBe(false);
    expect(doc.commands.broken).toBeUndefined();
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

  it("keeps the document when the storage read fails", async () => {
    const { storage } = fakeStorage();
    storage.get = async () => {
      throw new Error("disk on fire");
    };
    const store = new MetricsStore(storage, PROJECT);
    await expect(store.init()).rejects.toThrow("disk on fire");
    // The caller decides whether that is fatal; the store stays usable.
    await store.recordTrigger();
    expect(store.getSnapshot().triggerHits).toBe(1);
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

    expect(data.has(storageKeyFor("/home/dev/my-app"))).toBe(true);
    expect((data.get(storageKeyFor("/home/dev/my-app")) as { triggerHits: number }).triggerHits).toBe(1);
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

  it("does not write when nothing changed", async () => {
    const { storage, set } = fakeStorage();
    const store = new MetricsStore(storage, PROJECT);
    await store.init();
    await store.flush();
    expect(set).not.toHaveBeenCalled();
  });

  it("lists the other projects tracked on this machine but not itself", async () => {
    const other = storageKeyFor("/home/dev/other-app");
    const { storage } = fakeStorage({
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
    await store.recordTrigger();

    const others = await store.listOtherProjects();
    expect(others).toHaveLength(1);
    expect(others[0].projectName).toBe("other-app");
    expect(others[0].tools.php_lint.findings).toBe(3);
  });

  it("survives a storage that cannot be scanned", async () => {
    const { storage } = fakeStorage();
    storage.scan = async () => {
      throw new Error("scan unsupported");
    };
    const store = new MetricsStore(storage, PROJECT);
    await store.init();
    await expect(store.listOtherProjects()).resolves.toEqual([]);
  });
});

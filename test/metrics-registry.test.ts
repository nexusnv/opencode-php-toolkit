import { describe, expect, it, vi } from "vitest";
import { MetricsRegistry, resolveProjectScope } from "../src/metrics/registry.js";
import { storageKeyFor, type MetricsStorage } from "../src/metrics/store.js";

function fakeStorage(seed: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(seed));
  const get = vi.fn(async (key: string) => data.get(key));
  const set = vi.fn(async (key: string, value: unknown) => {
    data.set(key, value);
  });
  const remove = vi.fn(async (key: string) => {
    data.delete(key);
  });
  const scan = vi.fn(async (options: { prefix: string }) => ({
    entries: [...data.entries()]
      .filter(([key]) => key.startsWith(options.prefix))
      .map(([key, value]) => ({ key, value })),
  }));
  const storage: MetricsStorage = { get, set, remove, scan };
  return { storage, data, get, set, remove, scan };
}

const ACTIVE = { name: "my-app", path: "/home/dev/my-app" };

describe("resolveProjectScope", () => {
  it("keeps work inside the active project with that project", () => {
    expect(resolveProjectScope(ACTIVE.path, undefined)).toBe(ACTIVE.path);
    expect(resolveProjectScope(ACTIVE.path, ACTIVE.path)).toBe(ACTIVE.path);
    expect(resolveProjectScope(ACTIVE.path, "src")).toBe(ACTIVE.path);
    expect(resolveProjectScope(ACTIVE.path, "src/Controller")).toBe(ACTIVE.path);
    expect(resolveProjectScope(ACTIVE.path, "/home/dev/my-app/src")).toBe(ACTIVE.path);
    expect(resolveProjectScope(ACTIVE.path, "./src")).toBe(ACTIVE.path);
  });

  it("attributes work outside the active project to that directory", () => {
    expect(resolveProjectScope(ACTIVE.path, "/home/dev/other-app")).toBe("/home/dev/other-app");
    expect(resolveProjectScope(ACTIVE.path, "../other-app")).toBe("/home/dev/other-app");
  });
});

describe("MetricsRegistry", () => {
  it("keeps one store per project", () => {
    const { storage } = fakeStorage();
    const registry = new MetricsRegistry(storage, ACTIVE);
    expect(registry.storeFor("/home/dev/a")).toBe(registry.storeFor("/home/dev/a"));
    expect(registry.storeFor("/home/dev/a")).not.toBe(registry.storeFor("/home/dev/b"));
    expect(registry.active).toBe(registry.storeFor(ACTIVE.path));
  });

  it("records work against the project the tool actually ran in", async () => {
    const { storage, data } = fakeStorage();
    const registry = new MetricsRegistry(storage, ACTIVE);
    await registry.initActive();

    await registry.storeFor("/home/dev/other-app").recordTool({
      tool: "php_lint",
      status: "ok",
      findings: 2,
    });
    await registry.active.recordTool({ tool: "php_lint", status: "ok", findings: 1 });
    await registry.flushAll();

    const other = data.get(storageKeyFor("/home/dev/other-app")) as {
      tools: Record<string, { findings: number }>;
    };
    const own = data.get(storageKeyFor(ACTIVE.path)) as {
      tools: Record<string, { findings: number }>;
    };
    expect(other.tools.php_lint.findings).toBe(2);
    expect(own.tools.php_lint.findings).toBe(1);
  });

  it("survives a project whose document cannot be read", async () => {
    const { storage } = fakeStorage();
    storage.get = async () => {
      throw new Error("disk on fire");
    };
    const registry = new MetricsRegistry(storage, ACTIVE);
    await expect(registry.initActive()).rejects.toThrow("disk on fire");
    // The registry still works - it just cannot persist that project.
    await registry.active.recordTrigger();
    expect(registry.active.getSnapshot().triggerHits).toBe(1);
  });
});

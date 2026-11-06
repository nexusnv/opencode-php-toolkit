import { mkdtempSync, realpathSync, symlinkSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
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

  it("attributes work done through an inside-project symlink to the real location", () => {
    const root = mkdtempSync(join(tmpdir(), "php-toolkit-scope-"));
    const outside = mkdtempSync(join(tmpdir(), "php-toolkit-outside-"));
    const link = join(root, "outside-link");
    symlinkSync(outside, link);
    try {
      expect(resolveProjectScope(root, link)).toBe(realpathSync(outside));
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("resolves to the canonical root so symlinked and direct openings share one key", () => {
    const real = mkdtempSync(join(tmpdir(), "php-toolkit-canonical-"));
    const linkParent = mkdtempSync(join(tmpdir(), "php-toolkit-linkparent-"));
    const link = join(linkParent, "linked");
    symlinkSync(real, link);
    try {
      const canonical = realpathSync(real);
      expect(resolveProjectScope(link, undefined)).toBe(canonical);
      expect(resolveProjectScope(link, "src")).toBe(canonical);
      expect(resolveProjectScope(link, join(real, "src"))).toBe(canonical);
      // A different project is still its own scope.
      expect(resolveProjectScope(link, "../elsewhere")).not.toBe(canonical);
    } finally {
      rmSync(link, { recursive: true, force: true });
      rmSync(real, { recursive: true, force: true });
      rmSync(linkParent, { recursive: true, force: true });
    }
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

  it("keys the active project by its canonical path", async () => {
    const real = mkdtempSync(join(tmpdir(), "php-toolkit-active-"));
    const linkParent = mkdtempSync(join(tmpdir(), "php-toolkit-activeparent-"));
    const link = join(linkParent, "linked");
    symlinkSync(real, link);
    try {
      const { storage, data } = fakeStorage();
      const registry = new MetricsRegistry(storage, { name: "linked", path: link });
      await registry.initActive();
      await registry.active.recordTrigger();
      await registry.flushAll();

      // A session that opened the same project directly shares the document.
      const direct = new MetricsRegistry(storage, { name: basename(real), path: real });
      await direct.initActive();
      expect(direct.active.getSnapshot().triggerHits).toBe(1);
      expect(data.has(storageKeyFor(realpathSync(real)))).toBe(true);
    } finally {
      rmSync(link, { recursive: true, force: true });
      rmSync(real, { recursive: true, force: true });
      rmSync(linkParent, { recursive: true, force: true });
    }
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

  it("attributes explicit routing events to their project root", async () => {
    const { storage, data } = fakeStorage();
    const registry = new MetricsRegistry(storage, ACTIVE);
    await registry.initActive();
    await registry.recordRouting({ kind: "selected", skill: "php-testing" }, "/home/dev/other-app");
    await registry.recordRouting({ kind: "selected", skill: "php-debug" }, ACTIVE.path);
    await registry.flushAll();
    const other = data.get(storageKeyFor("/home/dev/other-app")) as {
      routing: { selections: Record<string, { count: number }> };
    };
    const own = data.get(storageKeyFor(ACTIVE.path)) as {
      routing: { selections: Record<string, { count: number }> };
    };
    expect(other.routing.selections["php-testing"].count).toBe(1);
    expect(other.routing.selections["php-debug"]).toBeUndefined();
    expect(own.routing.selections["php-debug"].count).toBe(1);
    expect(own.routing.selections["php-testing"]).toBeUndefined();
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

describe("MetricsRegistry resetActive", () => {
  it("clears the active project's persisted metrics", async () => {
    const key = storageKeyFor(ACTIVE.path);
    const { storage, data } = fakeStorage({
      [key]: { version: 2, triggerHits: 5, tools: {}, commands: {} },
    });
    const registry = new MetricsRegistry(storage, ACTIVE);
    await registry.initActive();
    expect(data.has(key)).toBe(true);

    const ok = await registry.resetActive();
    expect(ok).toBe(true);
    // Cleared to an empty document, not removed: legacy history must not be
    // re-adopted for this project on the next startup.
    expect((data.get(key) as { triggerHits: number }).triggerHits).toBe(0);
    expect(registry.active.getSnapshot().triggerHits).toBe(0);
  });
});

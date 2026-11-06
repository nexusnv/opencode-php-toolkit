import { describe, expect, it, vi } from "vitest";
import {
  applyTaskBoundary,
  createSessionState,
  markActivated,
  markAttached,
  markDenied,
} from "../src/routing/state.js";
import {
  hydrateStorageState,
  loadOrCreateState,
  persistStorageState,
  pruneStaleRoutingSessions,
  serializeStorageState,
  SESSION_STORAGE_PREFIX,
} from "../src/routing/persistence.js";

describe("session routing state", () => {
  it("does not mark selected skills as activated until activation event", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    markAttached(state, ["php-testing"], "pending");
    expect(state.activatedSkills.has("php-testing")).toBe(false);
    markActivated(state, "php-testing");
    expect(state.activatedSkills.has("php-testing")).toBe(true);
  });

  it("round-trips without prompt text", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    state.activeIntents = ["Build"];
    state.activeConcerns = ["Security"];
    const stored = serializeStorageState(state);
    const restored = hydrateStorageState(stored);
    expect(restored?.activeIntents).toEqual(["Build"]);
    expect(stored).not.toHaveProperty("prompt");
    expect(JSON.stringify(stored)).not.toContain("payment gateway");
  });

  it("round-trips the active Maintain subtype", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    state.activeIntents = ["Maintain"];
    state.maintainSubtype = "modernization";
    const stored = serializeStorageState(state);
    expect(stored.maintainSubtype).toBe("modernization");
    expect(hydrateStorageState(stored)?.maintainSubtype).toBe("modernization");
  });

  it("hydrates older documents without a Maintain subtype", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    const stored = serializeStorageState(state);
    delete (stored as { maintainSubtype?: unknown }).maintainSubtype;
    expect(hydrateStorageState(stored)?.maintainSubtype).toBeNull();
  });

  it("increments attempts and records permission status", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    markAttached(state, ["php-security"], "awaiting-approval");
    markAttached(state, ["php-security"], "pending");
    expect(state.unactivatedSkills[0]).toMatchObject({
      id: "php-security",
      attempts: 2,
      status: "pending",
      reason: "activation:not-confirmed",
    });
  });

  it("records denied without adding the skill to attached skills", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    markDenied(state, "php-security");
    expect(state.attachedSkills).not.toContain("php-security");
    expect(state.unactivatedSkills[0]).toMatchObject({
      id: "php-security",
      status: "denied",
      reason: "permission:denied",
    });
  });

  it("resets pending attempts on a new task but keeps denied entries", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    markAttached(state, ["php-security"], "pending");
    markDenied(state, "php-debug");
    const profile = {
      fingerprint: "f1",
      lockFingerprint: null,
    } as never;
    applyTaskBoundary(
      state,
      {
        reset: true,
        taskGeneration: 1,
        taskStartedAt: 100,
        intents: ["Build"],
        concerns: [],
        maintainSubtype: null,
        previousTask: null,
        mode: "new-task",
      },
      profile,
    );
    expect(state.unactivatedSkills.find((s) => s.id === "php-security")?.attempts).toBe(0);
    expect(state.unactivatedSkills.find((s) => s.id === "php-debug")?.status).toBe("denied");
  });
});

describe("session persistence", () => {
  it("rejects corrupt documents and documents for another scope", () => {
    expect(hydrateStorageState(null)).toBeNull();
    expect(hydrateStorageState({ schemaVersion: 2 })).toBeNull();
    expect(
      hydrateStorageState({
        ...serializeStorageState(
          createSessionState({
            sessionID: "s1",
            projectRoot: "/repo",
            projectSubpath: null,
          }),
        ),
        activeIntents: ["NotAnIntent"],
      }),
    ).toBeNull();
  });

  it("reuses in-memory state only for the same scope", async () => {
    const sessions = new Map();
    const storage = {
      get: async () => undefined,
      set: async () => {},
    };
    const first = await loadOrCreateState(storage, sessions, {
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    const second = await loadOrCreateState(storage, sessions, {
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    const moved = await loadOrCreateState(storage, sessions, {
      sessionID: "s1",
      projectRoot: "/other",
      projectSubpath: null,
    });
    expect(second).toBe(first);
    expect(moved).not.toBe(first);
    expect(moved.projectRoot).toBe("/other");
  });

  it("rejects out-of-range or oversized documents", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    state.taskGeneration = 1;
    const stored = serializeStorageState(state);
    expect(hydrateStorageState({ ...stored, taskGeneration: -1 })).toBeNull();
    expect(
      hydrateStorageState({ ...stored, taskStartedAt: Number.POSITIVE_INFINITY }),
    ).toBeNull();
    expect(
      hydrateStorageState({
        ...stored,
        unactivatedSkills: [{ id: "php-testing", attempts: -1, status: "pending", reason: "x" }],
      }),
    ).toBeNull();
    expect(
      hydrateStorageState({ ...stored, selectedSkills: ["x".repeat(129)] }),
    ).toBeNull();
    expect(
      hydrateStorageState({ ...stored, selectedSkills: Array(257).fill("php-testing") }),
    ).toBeNull();
    expect(
      hydrateStorageState({
        ...stored,
        unactivatedSkills: [
          { id: "php-testing", attempts: 1, status: "pending", reason: "x".repeat(257) },
        ],
      }),
    ).toBeNull();
  });

  it("hydrates persisted state after a restart", async () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    state.activeIntents = ["Maintain"];
    state.maintainSubtype = "modernization";
    const stored = serializeStorageState(state);
    const sessions = new Map();
    const storage = {
      get: async () => stored,
      set: async () => {},
    };
    const loaded = await loadOrCreateState(storage, sessions, {
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    expect(loaded).not.toBe(state);
    expect(loaded.activeIntents).toEqual(["Maintain"]);
    expect(loaded.maintainSubtype).toBe("modernization");
  });

  it("treats a storage read failure as a cache miss", async () => {
    const sessions = new Map();
    const storage = {
      get: async () => {
        throw new Error("storage offline");
      },
      set: async () => {},
    };
    const state = await loadOrCreateState(storage, sessions, {
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    expect(state.sessionID).toBe("s1");
  });

  it("serializes writes for the same session", async () => {
    const calls: string[] = [];
    const release: Array<() => void> = [];
    const storage = {
      set: vi.fn(async (_key: string, value: { taskGeneration: number }) => {
        calls.push(`start:${value.taskGeneration}`);
        await new Promise<void>((resolve) => release.push(resolve));
        calls.push(`end:${value.taskGeneration}`);
      }),
    };
    const first = createSessionState({ sessionID: "s1", projectRoot: "/repo", projectSubpath: null });
    first.taskGeneration = 1;
    const second = createSessionState({ sessionID: "s1", projectRoot: "/repo", projectSubpath: null });
    second.taskGeneration = 2;

    const p1 = persistStorageState(storage, first);
    const p2 = persistStorageState(storage, second);
    await vi.waitFor(() => expect(calls).toEqual(["start:1"]));
    release[0]!();
    await vi.waitFor(() => expect(calls).toEqual(["start:1", "end:1", "start:2"]));
    release[1]!();

    await Promise.all([p1, p2]);
    expect(calls).toEqual(["start:1", "end:1", "start:2", "end:2"]);
    expect(storage.set).toHaveBeenCalledTimes(2);
  });

  it("prunes only stale persisted session documents", async () => {
    const old = createSessionState({
      sessionID: "old",
      projectRoot: "/repo",
      projectSubpath: null,
      now: 1_000,
    });
    const fresh = createSessionState({
      sessionID: "fresh",
      projectRoot: "/repo",
      projectSubpath: null,
      now: 2_000_000,
    });
    const entries = new Map<string, unknown>([
      [`${SESSION_STORAGE_PREFIX}old`, serializeStorageState(old)],
      [`${SESSION_STORAGE_PREFIX}fresh`, serializeStorageState(fresh)],
      [`${SESSION_STORAGE_PREFIX}corrupt`, { schemaVersion: 1 }],
    ]);
    const storage = {
      scan: vi.fn(async () => ({
        entries: [...entries.entries()].map(([key, value]) => ({ key, value })),
      })),
      remove: vi.fn(async (key: string) => {
        entries.delete(key);
      }),
    };
    const removed = await pruneStaleRoutingSessions(storage, 2_000_000, 1_000);
    expect(removed).toBe(1);
    expect(entries.has(`${SESSION_STORAGE_PREFIX}old`)).toBe(false);
    expect(entries.has(`${SESSION_STORAGE_PREFIX}fresh`)).toBe(true);
    expect(entries.has(`${SESSION_STORAGE_PREFIX}corrupt`)).toBe(true);
  });
});

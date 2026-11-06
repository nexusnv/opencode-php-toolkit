import { describe, expect, it } from "vitest";
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
  serializeStorageState,
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
});

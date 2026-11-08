import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { serializeStorageState } from "../src/routing/persistence.js";
import plugin from "../src/index.js";
import { applySkillActivatedEvent } from "../src/routing/events.js";
import {
  createSessionState,
  markAttached,
  markDenied,
} from "../src/routing/state.js";

interface FakeOverrides {
  agent?: string | null;
  permissions?: Array<{ action: string; resource: string; effect: string }>;
  options?: Record<string, unknown>;
  roots?: Record<string, string>;
  events?: Array<{ type: string; data: any }>;
  storageSeed?: Record<string, unknown>;
}

async function waitFor(predicate: () => Promise<boolean>, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

interface FakePromptEvent {
  sessionID: string;
  prompt: {
    text: string;
    files?: Array<{ uri: string; name?: string }>;
    skills?: Array<{
      id: string;
      mention?: { start: number; end: number; text: string };
    }>;
  };
  metadata?: Record<string, unknown>;
}

function fakePluginContext(overrides: FakeOverrides = {}) {
  const skills = new Set<unknown>();
  const promptHooks: Array<(event: FakePromptEvent) => Promise<void> | void> = [];
  const contextHooks: Array<(event: any) => Promise<void> | void> = [];
  const compactionHooks: Array<(event: any) => Promise<void> | void> = [];
  const commands: Array<{ name: string; execute: (input: any) => Promise<void> }> = [];
  const prompted: Array<{ sessionID: string; text: string; metadata?: Record<string, unknown> }> = [];
  const defaultRoot = resolve("fixtures/php-app");
  const storageEntries = new Map<string, unknown>(Object.entries(overrides.storageSeed ?? {}));
  const storage = {
    get: async (key: string) => storageEntries.get(key),
    set: async (key: string, value: unknown) => {
      storageEntries.set(key, value);
    },
    remove: async (key: string) => {
      storageEntries.delete(key);
    },
    scan: async (options: { prefix: string; after?: string; limit?: number }) => {
      const entries = [...storageEntries.entries()]
        .filter(([key]) => key.startsWith(options.prefix) && (!options.after || key > options.after))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, options.limit ?? 100)
        .map(([key, value]) => ({ key, value }));
      return { entries };
    },
  };
  let releaseEvents = (): void => {};
  const eventGate = new Promise<void>((resolve) => {
    releaseEvents = resolve;
  });

  return {
    location: { directory: overrides.roots?.s1 ?? defaultRoot },
    options: overrides.options ?? { autoSkills: "attach" },
    session: {
      get: async (input: { sessionID: string }) => {
        const directory = overrides.roots?.[input.sessionID] ?? defaultRoot;
        return {
          id: input.sessionID,
          location: { directory },
          subpath: undefined,
          agent: overrides.agent === undefined ? "php-tester" : overrides.agent,
          permissions: overrides.permissions ?? [],
        };
      },
      hook: async (name: string, cb: any) => {
        if (name === "prompt") promptHooks.push(cb);
        if (name === "context") contextHooks.push(cb);
        if (name === "compaction") compactionHooks.push(cb);
        return { dispose: async () => {} };
      },
      prompt: async (input: {
        sessionID: string;
        text: string;
        metadata?: Record<string, unknown>;
      }) => {
        prompted.push({ sessionID: input.sessionID, text: input.text, metadata: input.metadata });
      },
    },
    command: {
      transform: async (cb: any) => {
        cb({
          add(command: { name: string; execute: (input: any) => Promise<void> }) {
            commands.push(command);
          },
        });
        return { dispose: async () => {} };
      },
    },
    tool: {
      transform: async (cb: any) => {
        cb({ namespace() {}, add() {} });
        return { dispose: async () => {} };
      },
      hook: async () => ({ dispose: async () => {} }),
    },
    skill: {
      transform: async (cb: any) => {
        cb({
          get: () => undefined,
          add(skill: unknown) {
            skills.add(skill);
          },
        });
        return { dispose: async () => {} };
      },
    },
    storage,
    storageEntries,
    event: {
      subscribe: async function* () {
        if (!overrides.events) return;
        await eventGate;
        for (const event of overrides.events) yield event;
      },
    },
    releaseEvents: () => releaseEvents(),
    triggerPromptHook: async (event: FakePromptEvent) => {
      for (const cb of promptHooks) await cb(event);
    },
    triggerContextHook: async (event: any) => {
      for (const cb of contextHooks) await cb(event);
    },
    triggerCompactionHook: async (event: any) => {
      for (const cb of compactionHooks) await cb(event);
    },
    commands,
    prompted,
    skills,
  };
}

async function setupPlugin(overrides: FakeOverrides = {}) {
  const fake = fakePluginContext(overrides);
  const result = await plugin.setup(fake as never);
  const cleanup = typeof result === "function" ? result : async () => {};
  return { fake, cleanup };
}

function promptEvent(
  sessionID: string,
  text: string,
  options: {
    files?: Array<{ uri: string; name?: string }>;
    skills?: Array<{
      id: string;
      mention?: { start: number; end: number; text: string };
    }>;
  } = {},
): FakePromptEvent {
  return {
    sessionID,
    prompt: {
      text,
      files: options.files ?? [],
      skills: options.skills ?? [],
    },
    metadata: {},
  };
}

const phpFile = [{ uri: "file:///repo/src/Example.php", name: "src/Example.php" }];
const phpTestFile = [
  { uri: "file:///repo/tests/ExampleTest.php", name: "tests/ExampleTest.php" },
];

describe("plugin routing integration", () => {
  it("attaches php-testing for a build prompt with PHP test files", async () => {
    const { fake, cleanup } = await setupPlugin();
    const event = promptEvent("s1", "Add a new feature with tests", {
      files: phpTestFile,
    });
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills?.map((skill) => skill.id)).toContain("php-testing");
    await cleanup();
  });

  it("attaches a core pattern skill for a narrow pattern prompt", async () => {
    const { fake, cleanup } = await setupPlugin({ agent: null });
    const event = promptEvent("s1", "Add a decorator around the payment gateway.", {
      files: phpFile,
    });
    await fake.triggerPromptHook(event);
    const ids = event.prompt.skills?.map((skill) => skill.id) ?? [];
    expect(ids).toContain("php-pattern-decorator");
    expect(ids).not.toContain("php-design-patterns");
    await cleanup();
  });

  it("registers core pattern skills as hidden and the index as advertised", async () => {
    const { fake, cleanup } = await setupPlugin();
    const registered = [...fake.skills] as Array<{ id: string; autoinvoke: boolean }>;
    const byId = new Map(registered.map((skill) => [skill.id, skill]));
    expect(byId.get("php-design-patterns")?.autoinvoke).toBe(true);
    for (const id of [
      "php-pattern-strategy",
      "php-pattern-adapter",
      "php-pattern-decorator",
      "php-pattern-state",
    ]) {
      expect(byId.get(id)?.autoinvoke).toBe(false);
    }
    await cleanup();
  });

  it("attaches nothing for a non-PHP prompt", async () => {
    const { fake, cleanup } = await setupPlugin({ agent: null });
    const event = promptEvent("s1", "Refactor this TypeScript component.");
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills).toEqual([]);
    await cleanup();
  });

  it("records selected skills but attaches nothing in hint mode", async () => {
    const { fake, cleanup } = await setupPlugin({
      options: { autoSkills: "hint" },
    });
    const event = promptEvent("s1", "Add a new endpoint.", { files: phpFile });
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills).toEqual([]);

    const context = { sessionID: "s1", system: [] as any[], messages: [] as any[] };
    await fake.triggerContextHook(context);
    const statePart = context.system.find(
      (part: any) => part.metadata?.["php-toolkit"]?.kind === "state",
    );
    expect(statePart?.text).toContain("selected=php-testing");
    expect(statePart?.text).toContain("attached=none");
    await cleanup();
  });

  it("attaches nothing in off mode but keeps L0 active", async () => {
    const { fake, cleanup } = await setupPlugin({
      options: { autoSkills: "off" },
    });
    const event = promptEvent("s1", "Add a new endpoint.", { files: phpFile });
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills).toEqual([]);

    const context = { sessionID: "s1", system: [] as any[], messages: [] as any[] };
    await fake.triggerContextHook(context);
    const l0 = context.system.find(
      (part: any) => part.metadata?.["php-toolkit"]?.kind === "l0",
    );
    expect(l0?.text).toContain("PHP toolkit engineering principles");
    const statePart = context.system.find(
      (part: any) => part.metadata?.["php-toolkit"]?.kind === "state",
    );
    expect(statePart?.text).toContain("selected=none");
    await cleanup();
  });

  it("preserves explicit skills when the router selects another skill", async () => {
    const { fake, cleanup } = await setupPlugin();
    const explicit = {
      id: "php-standards",
      mention: { start: 0, end: 13, text: "@php-standards" },
    };
    const event = promptEvent("s1", "Add a new endpoint with security.", {
      files: phpFile,
      skills: [explicit],
    });
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills?.[0]).toEqual(explicit);
    const ids = event.prompt.skills?.map((skill) => skill.id) ?? [];
    expect(ids).toContain("php-testing");
    expect(ids).toContain("php-security");
    await cleanup();
  });

  it("records a denied router skill without attaching it", async () => {
    const { fake, cleanup } = await setupPlugin({
      permissions: [{ action: "skill", resource: "php-*", effect: "deny" }],
    });
    const event = promptEvent("s1", "Add a new feature with tests", {
      files: phpTestFile,
    });
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills).toEqual([]);

    const status = fake.commands.find((command) => command.name === "php-toolkit-status");
    expect(status).toBeDefined();
    const writesBefore = fake.storageEntries.size;
    await status!.execute({
      sessionID: "s1",
      prompt: { text: "" },
      delivery: {} as never,
    });
    const generated = fake.prompted.at(-1);
    expect(generated?.text).toContain("Dropped: php-testing (permission:denied)");
    expect(generated?.metadata).toEqual({ "php-toolkit-status": true });

    // The status prompt is delivered through the prompt hook in real sessions.
    // It must not be routed or persisted as a trigger.
    const replay: FakePromptEvent = {
      sessionID: "s1",
      prompt: { text: generated!.text, files: [], skills: [] },
      metadata: { ...generated!.metadata },
    };
    await fake.triggerPromptHook(replay);
    expect(replay.prompt.skills).toEqual([]);
    expect(fake.storageEntries.size).toBe(writesBefore);
    await cleanup();
  });

  it("keeps an explicit denied skill in the prompt and records denial", async () => {
    const { fake, cleanup } = await setupPlugin({
      permissions: [{ action: "skill", resource: "php-standards", effect: "deny" }],
    });
    const writes: Array<{ key: string; value: any }> = [];
    fake.storage.set = async (key: string, value: unknown) => {
      writes.push({ key, value });
    };
    const explicit = {
      id: "php-standards",
      mention: { start: 0, end: 13, text: "@php-standards" },
    };
    const event = promptEvent("s1", "Review the diff for PSR-12 violations.", {
      files: phpFile,
      skills: [explicit],
    });
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills).toContainEqual(explicit);
    expect(
      event.prompt.skills?.filter((skill) => skill.id === "php-standards"),
    ).toHaveLength(1);

    const stored = writes.find((write) => write.key === "php-toolkit:session:s1")?.value;
    expect(stored?.unactivatedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "php-standards", status: "denied" }),
      ]),
    );
    await cleanup();
  });

  it("still admits the prompt when session persistence fails", async () => {
    const { fake, cleanup } = await setupPlugin();
    fake.storage.set = async () => {
      throw new Error("storage unavailable");
    };
    const event = promptEvent("s1", "Add a new feature with tests", {
      files: phpTestFile,
    });
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills?.map((skill) => skill.id)).toContain("php-testing");
    await cleanup();
  });

  it("attaches an ask skill once and does not re-attach while awaiting", async () => {
    const { fake, cleanup } = await setupPlugin({
      permissions: [{ action: "skill", resource: "php-*", effect: "ask" }],
    });
    const first = promptEvent("s1", "Add a new endpoint.", { files: phpFile });
    await fake.triggerPromptHook(first);
    expect(first.prompt.skills?.map((skill) => skill.id)).toContain("php-testing");

    const second = promptEvent("s1", "Add a new endpoint.", { files: phpFile });
    await fake.triggerPromptHook(second);
    expect(second.prompt.skills).toEqual([]);
    await cleanup();
  });

  it("marks activation only for the skill that loaded", () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/repo",
      projectSubpath: null,
    });
    markAttached(state, ["php-testing"], "pending");
    markDenied(state, "php-security");
    applySkillActivatedEvent(state, { sessionID: "s1", id: "php-testing" });
    expect(state.activatedSkills.has("php-testing")).toBe(true);
    expect(state.activatedSkills.has("php-security")).toBe(false);
  });

  it("removes old parts and pushes L0 plus at most one state part", async () => {
    const { fake, cleanup } = await setupPlugin();
    const event = promptEvent("s1", "Add a new endpoint.", { files: phpFile });
    await fake.triggerPromptHook(event);

    const context = {
      sessionID: "s1",
      system: [
        { type: "text", text: "keep me" },
        { type: "text", text: "old", metadata: { "php-toolkit": { kind: "state" } } },
      ],
      messages: [],
    };
    await fake.triggerContextHook(context);
    expect(context.system[0]).toEqual({ type: "text", text: "keep me" });
    const toolkitParts = context.system.filter(
      (part: any) => part.metadata?.["php-toolkit"],
    );
    expect(toolkitParts).toHaveLength(2);
    expect(
      toolkitParts.filter(
        (part: any) => part.metadata["php-toolkit"].kind === "state",
      ),
    ).toHaveLength(1);
    expect(toolkitParts.some((part: any) => part.text.includes("PHP toolkit engineering principles"))).toBe(true);
    await cleanup();
  });

  it("drops the PHP routing-state part after a non-PHP prompt", async () => {
    const { fake, cleanup } = await setupPlugin({ agent: null });
    const first = promptEvent("s1", "Add a new endpoint.", { files: phpFile });
    await fake.triggerPromptHook(first);
    const phpContext = { sessionID: "s1", system: [] as any[], messages: [] as any[] };
    await fake.triggerContextHook(phpContext);
    expect(
      phpContext.system.some((part: any) => part.metadata?.["php-toolkit"]?.kind === "state"),
    ).toBe(true);

    const second = promptEvent("s1", "Refactor this TypeScript component.");
    await fake.triggerPromptHook(second);
    const movedOn = { sessionID: "s1", system: [] as any[], messages: [] as any[] };
    await fake.triggerContextHook(movedOn);
    expect(
      movedOn.system.some((part: any) => part.metadata?.["php-toolkit"]?.kind === "state"),
    ).toBe(false);
    expect(
      movedOn.system.some((part: any) => part.metadata?.["php-toolkit"]?.kind === "l0"),
    ).toBe(true);
    await cleanup();
  });

  it("does not persist routing state when only showing status", async () => {
    const { fake, cleanup } = await setupPlugin({ agent: null });
    const status = fake.commands.find((command) => command.name === "php-toolkit-status");
    expect(status).toBeDefined();
    await status!.execute({
      sessionID: "s1",
      prompt: { text: "" },
      delivery: {} as never,
    });
    const persisted = [...fake.storageEntries.keys()].filter((key) =>
      key.startsWith("php-toolkit:session:"),
    );
    expect(persisted).toEqual([]);
    expect(fake.prompted.at(-1)?.text).toContain("Task: generation 0");
    await cleanup();
  });

  it("gives two sessions in different roots different profiles", async () => {
    const { fake, cleanup } = await setupPlugin({
      roots: {
        s1: resolve("fixtures/php-app"),
        s2: resolve("fixtures/php-library"),
      },
    });
    await fake.triggerPromptHook(
      promptEvent("s1", "Add a new endpoint.", { files: phpFile }),
    );
    await fake.triggerPromptHook(
      promptEvent("s2", "Add a new endpoint.", { files: phpFile }),
    );

    const first = { sessionID: "s1", system: [] as any[], messages: [] as any[] };
    const second = { sessionID: "s2", system: [] as any[], messages: [] as any[] };
    await fake.triggerContextHook(first);
    await fake.triggerContextHook(second);
    const firstState = first.system.find(
      (part: any) => part.metadata?.["php-toolkit"]?.kind === "state",
    );
    const secondState = second.system.find(
      (part: any) => part.metadata?.["php-toolkit"]?.kind === "state",
    );
    expect(firstState?.text).toContain("application");
    expect(secondState?.text).toContain("library");
    await cleanup();
  });

  it("applies activation events from the subscription stream", async () => {
    const { fake, cleanup } = await setupPlugin({
      events: [
        { type: "session.skill.activated", data: { sessionID: "s1", id: "php-testing" } },
      ],
    });
    const event = promptEvent("s1", "Add a test for the parser.", { files: phpFile });
    await fake.triggerPromptHook(event);
    expect(event.prompt.skills).toContainEqual({ id: "php-testing" });

    fake.releaseEvents();
    await waitFor(async () => {
      const context = { sessionID: "s1", system: [] as any[] };
      await fake.triggerContextHook(context);
      return context.system.some((part: any) =>
        part.text.includes("activated=php-testing"),
      );
    });
    await cleanup();
  });

  it("hydrates a pre-existing session for activation events after a restart", async () => {
    const root = resolve("fixtures/php-app");
    const state = createSessionState({ sessionID: "s1", projectRoot: root, projectSubpath: null });
    markAttached(state, ["php-testing"], "pending");
    const seed = { "php-toolkit:session:s1": serializeStorageState(state) };
    const { fake, cleanup } = await setupPlugin({
      storageSeed: seed,
      events: [
        { type: "session.skill.activated", data: { sessionID: "s1", id: "php-testing" } },
      ],
    });

    fake.releaseEvents();
    await waitFor(async () => {
      const stored = fake.storageEntries.get("php-toolkit:session:s1") as any;
      return Array.isArray(stored?.activatedSkills) && stored.activatedSkills.includes("php-testing");
    });
    await cleanup();
  });

  it("hydrates a pre-existing session for permission events after a restart", async () => {
    const root = resolve("fixtures/php-app");
    const state = createSessionState({ sessionID: "s1", projectRoot: root, projectSubpath: null });
    markAttached(state, ["php-testing"], "pending");
    const seed = { "php-toolkit:session:s1": serializeStorageState(state) };
    const { fake, cleanup } = await setupPlugin({
      storageSeed: seed,
      events: [
        {
          type: "session.permissions",
          data: {
            sessionID: "s1",
            permissions: [{ action: "skill", resource: "php-testing", effect: "deny" }],
          },
        },
      ],
    });

    fake.releaseEvents();
    await waitFor(async () => {
      const stored = fake.storageEntries.get("php-toolkit:session:s1") as any;
      return stored?.unactivatedSkills?.[0]?.status === "denied";
    });
    await cleanup();
  });

  it("does not hydrate a session whose persisted project scope no longer matches", async () => {
    const state = createSessionState({
      sessionID: "s1",
      projectRoot: "/elsewhere",
      projectSubpath: null,
    });
    markAttached(state, ["php-testing"], "pending");
    const seed = { "php-toolkit:session:s1": serializeStorageState(state) };
    const { fake, cleanup } = await setupPlugin({
      storageSeed: seed,
      events: [
        { type: "session.skill.activated", data: { sessionID: "s1", id: "php-testing" } },
      ],
    });

    fake.releaseEvents();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stored = fake.storageEntries.get("php-toolkit:session:s1") as any;
    expect(stored.activatedSkills ?? []).not.toContain("php-testing");
    await cleanup();
  });

  it("does not mutate the compaction summary", async () => {
    const { fake, cleanup } = await setupPlugin();
    const event = {
      sessionID: "s1",
      result: { summary: "keep me" },
      system: [],
      messages: [],
    };
    await fake.triggerCompactionHook(event);
    expect(event.result.summary).toBe("keep me");
    await cleanup();
  });
});

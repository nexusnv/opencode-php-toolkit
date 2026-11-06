import { describe, expect, it } from "vitest";
import { transitionTask } from "../src/routing/task-boundary.js";

const active = {
  taskGeneration: 2,
  taskStartedAt: Date.now() - 60_000,
  activeIntents: ["Build" as const],
  activeConcerns: ["Security" as const],
  maintainSubtype: null,
  previousTask: null,
};

describe("transitionTask", () => {
  it("inherits concerns for an unambiguous continuation", () => {
    const next = transitionTask({
      prompt: "also add tests",
      current: { intents: ["Test"], concerns: ["Testing"], maintainSubtype: null },
      active,
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(false);
    expect(next.taskGeneration).toBe(2);
    expect(next.concerns).toEqual(expect.arrayContaining(["Security", "Testing"]));
  });

  it("does not inherit prior concerns for an unrelated strong-intent task", () => {
    const next = transitionTask({
      prompt: "Add a CSV export feature.",
      current: { intents: ["Build"], concerns: [], maintainSubtype: null },
      active,
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
    expect(next.taskGeneration).toBe(3);
    expect(next.concerns).toEqual([]);
  });

  it("resets explicitly for a switch request", () => {
    const next = transitionTask({
      prompt: "different problem: tidy the README",
      current: { intents: ["Maintain"], concerns: [], maintainSubtype: "refactor" },
      active,
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
    expect(next.previousTask?.intents).toEqual(["Build"]);
  });

  it("treats stale tasks older than 30 minutes as new", () => {
    const next = transitionTask({
      prompt: "summarize the project",
      current: { intents: [], concerns: [], maintainSubtype: null },
      active: { ...active, taskStartedAt: Date.now() - 31 * 60_000 },
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
  });

  it("inherits the Maintain subtype across a continuation", () => {
    const next = transitionTask({
      prompt: "also add tests",
      current: { intents: ["Test"], concerns: ["Testing"], maintainSubtype: null },
      active: {
        ...active,
        activeIntents: ["Maintain"],
        activeConcerns: [],
        maintainSubtype: "modernization",
      },
      files: ["src/Example.php"],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(false);
    expect(next.intents).toContain("Maintain");
    expect(next.maintainSubtype).toBe("modernization");
  });

  it("keeps the active intent but recomputes concerns for an ambiguous continuation", () => {
    const next = transitionTask({
      prompt: "also refactor the module",
      current: {
        intents: ["Maintain"],
        concerns: ["Architecture"],
        maintainSubtype: "refactor",
      },
      active: {
        ...active,
        activeIntents: ["Build"],
        activeConcerns: ["Security"],
        maintainSubtype: null,
      },
      files: ["src/Example.php"],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(false);
    expect(next.mode).toBe("ambiguous-continuation");
    expect(next.intents).toEqual(["Build"]);
    expect(next.concerns).toEqual(["Architecture"]);
  });

  it("recomputes the Maintain subtype for a new task", () => {
    const next = transitionTask({
      prompt: "Add a CSV export feature.",
      current: { intents: ["Build"], concerns: [], maintainSubtype: null },
      active: {
        ...active,
        activeIntents: ["Maintain"],
        activeConcerns: [],
        maintainSubtype: "modernization",
      },
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
    expect(next.maintainSubtype).toBeNull();
  });
});

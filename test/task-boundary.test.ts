import { describe, expect, it } from "vitest";
import { transitionTask } from "../src/routing/task-boundary.js";

const active = {
  taskGeneration: 2,
  taskStartedAt: Date.now() - 60_000,
  activeIntents: ["Build" as const],
  activeConcerns: ["Security" as const],
  previousTask: null,
};

describe("transitionTask", () => {
  it("inherits concerns for an unambiguous continuation", () => {
    const next = transitionTask({
      prompt: "also add tests",
      current: { intents: ["Test"], concerns: ["Testing"] },
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
      current: { intents: ["Build"], concerns: [] },
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
      current: { intents: ["Maintain"], concerns: [] },
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
      current: { intents: [], concerns: [] },
      active: { ...active, taskStartedAt: Date.now() - 31 * 60_000 },
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
  });
});

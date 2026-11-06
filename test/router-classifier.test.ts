import { describe, expect, it } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import { classify } from "../src/routing/classifier.js";
import type { SessionRoutingState } from "../src/routing/types.js";

// PHP context comes from the attached file unless a case overrides it.
const base = {
  files: ["src/Example.php"] as string[],
  agent: null as string | null,
  profile: null as ProjectProfile | null,
  state: null as SessionRoutingState | null,
};

describe("classify", () => {
  it("scores a build prompt and attaches Build only", () => {
    const result = classify({ prompt: "Add a new payment gateway.", ...base });
    expect(result.intents).toContain("Build");
    expect(result.phpContext).toBe(true);
    expect(result.scores["Design patterns"]).toBe(2);
  });

  it("finds no PHP context in a TypeScript-only prompt", () => {
    const result = classify({ prompt: "add a TypeScript component", ...base, files: [] });
    expect(result.phpContext).toBe(false);
    expect(result.intents).toEqual([]);
    expect(result.concerns).toEqual([]);
  });

  it("removes Debug below threshold and selects Design only when strong", () => {
    const result = classify({
      prompt: "Refactor the payment module to use the Strategy pattern.",
      ...base,
    });
    expect(result.intents).toContain("Maintain");
    expect(result.concerns).toContain("Design patterns");
  });

  it("applies negative quick-fix signals to architecture", () => {
    const result = classify({ prompt: "quick fix for architecture typo", ...base });
    expect(result.scores["Architecture"]).toBeLessThan(2);
  });

  it("gates generic gateway from pattern attachment for Test intent", () => {
    const result = classify({ prompt: "Write a test for the payment gateway.", ...base });
    expect(result.concerns).not.toContain("Design patterns");
  });

  it("treats actionable intent verbs as work, not knowledge questions", () => {
    const build = classify({ prompt: "How do I introduce a new feature?", ...base });
    expect(build.questionForm).toBe(false);
    expect(build.intents).toContain("Build");

    const design = classify({ prompt: "How do I design a new module?", ...base });
    expect(design.questionForm).toBe(false);
    expect(design.intents).toContain("Design");

    const knowledge = classify({
      prompt: "What is the difference between Strategy and Adapter?",
      ...base,
    });
    expect(knowledge.questionForm).toBe(true);
  });

  it("treats an active PHP agent as an explicit PHP-context signal", () => {
    const result = classify({
      prompt: "Review this component.",
      ...base,
      files: [],
      agent: "php-reviewer",
    });
    expect(result.phpContext).toBe(true);
    expect(result.intents).toContain("Review");
  });

  it("disables classifier design gating when architectureMode is off", () => {
    const prompt = "Write a test for the module.";
    const risk = classify({ prompt, ...base, architectureMode: "risk" });
    expect(risk.concerns).not.toContain("Architecture");

    const off = classify({ prompt, ...base, architectureMode: "off" });
    expect(off.concerns).toContain("Architecture");
  });

  it("notes framework context without treating it as PHP context", () => {
    const frameworkOnly = classify({
      prompt: "Add a Laravel controller.",
      ...base,
      files: [],
    });
    expect(frameworkOnly.phpContext).toBe(false);
    expect(frameworkOnly.reasonCodes).toContain("framework:laravel");

    const phpAndFramework = classify({
      prompt: "Add a Laravel controller.",
      ...base,
    });
    expect(phpAndFramework.phpContext).toBe(true);
    expect(phpAndFramework.reasonCodes).toContain("framework:laravel");
  });
});

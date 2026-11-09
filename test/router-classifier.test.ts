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

  it("detects comparisons independently of question form", () => {
    const knowledge = classify({
      prompt: "What is the difference between Strategy and Adapter?",
      ...base,
    });
    expect(knowledge.questionForm).toBe(true);
    expect(knowledge.comparison).toBe(true);

    const actionable = classify({
      prompt: "Compare Strategy and Adapter for a review.",
      ...base,
    });
    expect(actionable.questionForm).toBe(false);
    expect(actionable.comparison).toBe(true);

    const implementation = classify({
      prompt:
        "How do I put Strategy and Adapter in my PHP architecture? Please make those changes.",
      ...base,
    });
    expect(implementation.questionForm).toBe(true);
    expect(implementation.comparison).toBe(false);
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

  it("scores deptrac.yaml and deptrac.yml both as architecture file signals", () => {
    for (const file of ["deptrac.yaml", "deptrac.yml"]) {
      const result = classify({
        prompt: "add a new endpoint",
        ...base,
        files: ["src/Example.php", file],
      });
      expect(result.scores.Architecture).toBe(2);
    }
  });

  it("classifies modernize as modernization without requiring legacy wording", () => {
    const result = classify({ prompt: "Modernize the billing code.", ...base });
    expect(result.intents).toContain("Maintain");
    expect(result.maintainSubtype).toBe("modernization");
  });

  it("uses a normalized Windows composer.json attachment as PHP context", () => {
    const result = classify({
      prompt: "Review this change.",
      ...base,
      files: ["C:\\project\\composer.json"],
    });
    expect(result.phpContext).toBe(true);
    expect(result.intents).toContain("Review");
  });

  it("records promoted pattern names strongest first", () => {
    const two = classify({
      prompt: "Refactor to the Strategy pattern and add an adapter.",
      ...base,
    });
    expect(two.promotedPatterns).toEqual(["strategy", "adapter"]);

    const one = classify({ prompt: "Explain the Strategy pattern.", ...base });
    expect(one.promotedPatterns).toEqual(["strategy"]);
    expect(one.questionForm).toBe(true);

    const generic = classify({ prompt: "Improve the design pattern usage.", ...base });
    expect(generic.promotedPatterns).toEqual([]);
  });

  it("records state machine as a state-pattern signal", () => {
    const result = classify({
      prompt: "Refactor the switch into a state machine.",
      ...base,
    });
    expect(result.promotedPatterns).toEqual(["state"]);
  });

  it("does not let a data provider count as a design-pattern provider", () => {
    const result = classify({
      prompt: "Add a data provider for the invoice tests.",
      ...base,
    });
    expect(result.scores["Design patterns"]).toBe(0);
    expect(result.scores.Testing).toBeGreaterThanOrEqual(2);
  });

  it("records no promoted patterns without PHP context", () => {
    const result = classify({
      prompt: "Use the strategy pattern in this TypeScript file.",
      ...base,
      files: [],
    });
    expect(result.phpContext).toBe(false);
    expect(result.promotedPatterns).toEqual([]);
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

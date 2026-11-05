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
});

import { describe, expect, it } from "vitest";
import { renderToolkitStatus } from "../src/status/toolkit-status.js";

describe("renderToolkitStatus", () => {
  it("shows profile, confidence, task generation, selection, reasons and verification marker", () => {
    const text = renderToolkitStatus({
      profile: {
        root: "/repo/app",
        subpath: null,
        type: "application",
        typeConfidence: "high",
        phpRequirement: "^8.2",
        frameworkHints: ["none"],
        tools: { phpunit: true } as never,
      } as never,
      state: {
        taskGeneration: 3,
        activeIntents: ["Build"],
        activeConcerns: ["Testing"],
        selectedSkills: ["php-testing"],
        attachedSkills: ["php-testing"],
        activatedSkills: new Set(["php-testing"]),
        unactivatedSkills: [],
        droppedSkills: [{ id: "php-security", reason: "budget:max-skills" }],
        lastPromptAt: 0,
        verification: { lastRunAt: null, status: null, failedChecks: [] },
      } as never,
      config: {
        autoSkills: "attach",
        architectureMode: "risk",
        architectureScan: "tool",
        announceSelections: "off",
      } as never,
    });
    expect(text).toContain("Project: /repo/app (application, high confidence");
    expect(text).toContain("Task: generation 3");
    expect(text).toContain("Selected: php-testing");
    expect(text).toContain("Dropped: php-security (budget:max-skills)");
    expect(text).toContain("Reasons: intent:build, concern:testing, budget:max-skills");
    expect(text).toContain("Verify: unavailable (Phase 3)");
  });

  it("does not invent a profile when the session has no location", () => {
    const text = renderToolkitStatus({
      profile: null,
      state: null,
      config: {
        autoSkills: "attach",
        architectureMode: "risk",
        architectureScan: "tool",
        announceSelections: "off",
      } as never,
    });
    expect(text).toContain("Project: unavailable (session has no location)");
  });
});

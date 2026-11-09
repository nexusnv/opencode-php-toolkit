import { describe, expect, it } from "vitest";
import { DEFAULT_TOOLKIT_CONFIG } from "../src/config.js";
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
    expect(text).toContain("Verify: not run yet");
  });

  it("shows the last verification run and aggregate status", () => {
    const text = renderToolkitStatus({
      profile: null,
      state: null,
      config: DEFAULT_TOOLKIT_CONFIG,
      verification: {
        runs: 2,
        passed: 1,
        failed: 1,
        warning: 0,
        skipped: 2,
        partial: 0,
        unavailable: 0,
        error: 0,
        timedOut: 0,
        cancelled: 0,
        findings: 3,
        lastRunAt: "2026-11-08T05:31:00.000Z",
        lastStatus: "failed",
      },
    });
    expect(text).toContain("Verify: last run 2026-11-08 05:31Z — failed");
    expect(text).toContain("2 run(s), 3 finding(s)");
  });

  it("says verification has not run yet", () => {
    const text = renderToolkitStatus({
      profile: null,
      state: null,
      config: DEFAULT_TOOLKIT_CONFIG,
    });
    expect(text).toContain("Verify: not run yet");
  });

  it("reports awaiting and denied skills only when present", () => {
    const config = {
      autoSkills: "attach",
      architectureMode: "risk",
      architectureScan: "tool",
      announceSelections: "off",
    } as never;
    const state = {
      taskGeneration: 1,
      activeIntents: ["Maintain"],
      activeConcerns: [],
      selectedSkills: ["php-modernize", "php-security"],
      attachedSkills: ["php-modernize", "php-security"],
      activatedSkills: new Set<string>(),
      unactivatedSkills: [
        { id: "php-security", status: "awaiting-approval", attempts: 0, reason: "permission:pending" },
        { id: "php-modernize", status: "denied", attempts: 0, reason: "permission:denied" },
      ],
      droppedSkills: [],
      lastPromptAt: 0,
      verification: { lastRunAt: null, status: null, failedChecks: [] },
    } as never;

    const text = renderToolkitStatus({ profile: null, state, config });
    expect(text).toContain("Awaiting approval: php-security");
    expect(text).toContain("Denied: php-modernize");
    expect(text).toContain("Reasons: intent:maintain, permission:pending, permission:denied");

    const quiet = renderToolkitStatus({
      profile: null,
      state: { ...(state as object), unactivatedSkills: [] } as never,
      config,
    });
    expect(quiet).not.toContain("Awaiting approval:");
    expect(quiet).not.toContain("Denied:");
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

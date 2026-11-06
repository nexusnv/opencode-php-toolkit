import { describe, expect, it } from "vitest";
import { selectSkills } from "../src/routing/selector.js";

const contentLengths = new Map([
  ["php-architecture", 1000],
  ["php-testing", 900],
  ["php-security", 800],
  ["php-standards", 700],
  ["php-debug", 600],
  ["php-composer", 600],
  ["php-modernize", 600],
  ["php-static-analysis", 600],
]);

describe("selectSkills", () => {
  it("attaches php-standards and security for a security review", () => {
    const result = selectSkills({
      prompt: "security review",
      intents: ["Review"],
      concerns: ["Security"],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
    });
    expect(result.selected).toEqual(expect.arrayContaining(["php-standards", "php-security"]));
  });

  it("never exceeds the soft budget and records drops", () => {
    const result = selectSkills({
      prompt: "security testing debugging static analysis review",
      intents: ["Review"],
      concerns: ["Security", "Testing", "Debugging", "Static analysis"],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
    });
    expect(result.selected.length).toBeLessThanOrEqual(3);
    expect(result.dropped.length).toBeGreaterThan(0);
  });

  it("does not count explicit skills against the router budget", () => {
    const result = selectSkills({
      prompt: "Add a new endpoint.",
      intents: ["Build"],
      concerns: [],
      maintainSubtype: null,
      questionForm: false,
      explicit: [
        { id: "php-standards" },
        { id: "php-debug" },
        { id: "php-composer" },
      ],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
    });
    expect(result.selected).toContain("php-testing");
    expect(result.selected).toHaveLength(4);
  });

  it("keeps explicit skills beyond the soft budget but not marked activated", () => {
    const result = selectSkills({
      prompt: "build with explicit skills",
      intents: ["Build"],
      concerns: ["Security"],
      maintainSubtype: null,
      questionForm: false,
      explicit: [
        { id: "php-security" },
        { id: "php-testing" },
        { id: "php-standards" },
        { id: "php-debug" },
      ],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 1, maxSkillChars: 100 },
      contentLengths,
    });
    expect(result.selected).toEqual(
      expect.arrayContaining(["php-security", "php-testing", "php-standards", "php-debug"]),
    );
    expect(result.selected.length).toBe(4);
    expect(result.attach).toEqual([]);
  });

  it("suppresses an unactivated skill after two attempts", () => {
    const result = selectSkills({
      prompt: "build with security",
      intents: ["Build"],
      concerns: ["Security"],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [
        {
          id: "php-security",
          status: "pending",
          attempts: 2,
          reason: "activation:not-confirmed",
        },
      ],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
    });
    expect(result.selected).not.toContain("php-security");
    expect(result.dropped).toContainEqual({
      id: "php-security",
      reason: "activation:not-confirmed",
    });
  });

  it("uses the fourth slot for a high-confidence security concern", () => {
    const result = selectSkills({
      prompt: "Upgrade to PHP 8.3, fix deprecations, add tests, and fix a security vulnerability.",
      intents: ["Maintain", "Test"],
      concerns: ["Security", "Testing"],
      maintainSubtype: "modernization",
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
      scores: { Security: 6, Testing: 2, Maintain: 6, Test: 3 },
    });
    expect(result.selected).toHaveLength(4);
    expect(result.selected).toContain("php-security");
    expect(result.reasonCodes).toContain("security:hard-ceiling");
    expect(result.dropped).not.toContainEqual(
      expect.objectContaining({ id: "php-security" }),
    );
  });

  it("does not replace explicit or intent co-skills with security at the hard ceiling", () => {
    const result = selectSkills({
      prompt: "Upgrade to PHP 8.3 and debug the security vulnerability.",
      intents: ["Maintain", "Debug"],
      concerns: ["Security"],
      maintainSubtype: "modernization",
      questionForm: false,
      explicit: [{ id: "php-standards" }],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
      scores: { Security: 6, Maintain: 6, Debug: 3 },
    });
    expect(result.selected).toHaveLength(4);
    expect(result.selected).not.toContain("php-security");
    expect(result.dropped).toContainEqual({ id: "php-security", reason: "budget:max-skills" });
  });

  it("does not force a suppressed security concern", () => {
    const result = selectSkills({
      prompt: "Upgrade to PHP 8.3, fix deprecations, add tests, and fix a security vulnerability.",
      intents: ["Maintain", "Test"],
      concerns: ["Security", "Testing"],
      maintainSubtype: "modernization",
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [
        {
          id: "php-security",
          status: "denied",
          attempts: 1,
          reason: "permission:denied",
        },
      ],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
      scores: { Security: 6, Testing: 2, Maintain: 6, Test: 3 },
    });
    expect(result.selected).not.toContain("php-security");
  });

  it("uses the prompt for feature-scale and broad-review terms", () => {
    const feature = selectSkills({
      prompt: "Add an endpoint.",
      intents: ["Build"],
      concerns: [],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
    });
    expect(feature.selected).toContain("php-testing");

    const broad = selectSkills({
      prompt: "Review this PR.",
      intents: ["Review"],
      concerns: [],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
    });
    expect(broad.selected).toContain("php-security");
  });
});

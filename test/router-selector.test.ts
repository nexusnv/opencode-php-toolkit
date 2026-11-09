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

  it("does not let a denied skill consume the router budget", () => {
    const result = selectSkills({
      prompt: "security testing debugging",
      intents: [],
      concerns: ["Security", "Testing", "Debugging"],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 2, maxSkillChars: 12000 },
      contentLengths,
      denied: new Set(["php-security"]),
    });
    expect(result.selected).toEqual(["php-testing", "php-debug"]);
    expect(result.dropped).toContainEqual({ id: "php-security", reason: "permission:denied" });
  });

  it("does not attach a skill the host cannot resolve", () => {
    const result = selectSkills({
      prompt: "security",
      intents: [],
      concerns: ["Security"],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
      available: new Set(["php-testing"]),
      scores: { Security: 6 },
    });
    expect(result.selected).toEqual([]);
    expect(result.dropped).toContainEqual({ id: "php-security", reason: "skill:unavailable" });
    expect(result.reasonCodes).not.toContain("security:hard-ceiling");
  });

  it("does not add automatic skills beyond the hard skill ceiling", () => {
    const explicit = [
      { id: "php-standards" },
      { id: "php-debug" },
      { id: "php-composer" },
      { id: "php-static-analysis" },
    ];
    const result = selectSkills({
      prompt: "add an endpoint with security",
      intents: ["Build"],
      concerns: ["Security"],
      maintainSubtype: null,
      questionForm: false,
      explicit,
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
    });
    expect(result.selected).toEqual(explicit.map((entry) => entry.id));
    expect(result.attach).toEqual([]);
    expect(result.dropped).toContainEqual({ id: "php-security", reason: "budget:max-skills" });
  });

  it("keeps automatic skills within the hard character ceiling", () => {
    const lengths = new Map(contentLengths);
    lengths.set("php-standards", 5300);
    lengths.set("php-debug", 5300);
    lengths.set("php-composer", 5300);
    const result = selectSkills({
      prompt: "new feature with tests",
      intents: ["Build"],
      concerns: [],
      maintainSubtype: null,
      questionForm: false,
      explicit: [{ id: "php-standards" }, { id: "php-debug" }, { id: "php-composer" }],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: lengths,
    });
    expect(result.selected).toHaveLength(3);
    expect(result.attach).toEqual([]);
    expect(result.dropped).toContainEqual({ id: "php-testing", reason: "budget:max-chars" });
  });

  it("applies the question-form concern threshold in the fill pass", () => {
    const result = selectSkills({
      prompt: "What about testing?",
      intents: [],
      concerns: ["Testing"],
      maintainSubtype: null,
      questionForm: true,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths,
      scores: { Testing: 1 },
    });
    expect(result.selected).toEqual([]);
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

  const patternLengths = new Map(contentLengths);
  patternLengths.set("php-design-patterns", 4200);
  patternLengths.set("php-pattern-strategy", 2400);
  patternLengths.set("php-pattern-adapter", 2400);
  patternLengths.set("php-pattern-decorator", 2400);
  patternLengths.set("php-pattern-state", 2400);

  it("attaches the index for a generic design task", () => {
    const result = selectSkills({
      prompt: "Design a new payment flow.",
      intents: ["Design"],
      concerns: [],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: patternLengths,
    });
    expect(result.selected).toEqual(["php-architecture", "php-design-patterns"]);
  });

  it("attaches one named promoted pattern skill", () => {
    const result = selectSkills({
      prompt: "Add a decorator around the payment gateway.",
      intents: ["Build"],
      concerns: ["Design patterns"],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: patternLengths,
      scores: { "Design patterns": 4 },
      promotedPatterns: ["decorator"],
    });
    expect(result.selected).toContain("php-pattern-decorator");
    expect(result.selected).not.toContain("php-design-patterns");
  });

  it("attaches at most two core skills when two patterns are named", () => {
    const result = selectSkills({
      prompt: "Refactor to Strategy and Adapter.",
      intents: ["Maintain"],
      concerns: ["Design patterns"],
      maintainSubtype: "refactor",
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: patternLengths,
      scores: { "Design patterns": 5 },
      promotedPatterns: ["strategy", "adapter"],
    });
    expect(result.selected).toEqual([
      "php-architecture",
      "php-pattern-strategy",
      "php-pattern-adapter",
    ]);
  });

  it("uses the index for a comparison question with two names", () => {
    const result = selectSkills({
      prompt: "What is the difference between Strategy and Adapter?",
      intents: [],
      concerns: ["Design patterns"],
      maintainSubtype: null,
      questionForm: true,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: patternLengths,
      scores: { "Design patterns": 4 },
      promotedPatterns: ["strategy", "adapter"],
    });
    expect(result.selected).toEqual(["php-design-patterns"]);
  });

  it("uses the index for a comparison question when an agent adds an actionable intent", () => {
    const result = selectSkills({
      prompt: "What is the difference between Strategy and Adapter?",
      intents: ["Review"],
      concerns: ["Design patterns"],
      maintainSubtype: null,
      questionForm: true,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: patternLengths,
      scores: { "Design patterns": 4, Review: 3 },
      agentDefault: "Review",
      promotedPatterns: ["strategy", "adapter"],
    });
    expect(result.selected).toEqual(["php-design-patterns"]);
  });

  it("falls back to the index for a P1 pattern name", () => {
    const result = selectSkills({
      prompt: "Add a repository for the Order aggregate.",
      intents: ["Build"],
      concerns: ["Architecture", "Design patterns"],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: patternLengths,
      scores: { Architecture: 2, "Design patterns": 2 },
      promotedPatterns: [],
    });
    // The pattern co-skill outranks the Architecture concern skill.
    expect(result.selected).toEqual(["php-design-patterns", "php-architecture"]);
  });

  it("respects the Patterns threshold outside the Design intent", () => {
    const result = selectSkills({
      prompt: "Add a strategy for pricing.",
      intents: ["Build"],
      concerns: [],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: patternLengths,
      scores: { "Design patterns": 1 },
      promotedPatterns: ["strategy"],
    });
    expect(result.selected).toEqual([]);
  });

  it("still attaches the index for Design below the pattern threshold", () => {
    const result = selectSkills({
      prompt: "Design the module boundaries.",
      intents: ["Design"],
      concerns: [],
      maintainSubtype: null,
      questionForm: false,
      explicit: [],
      activated: new Set(),
      unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 },
      contentLengths: patternLengths,
      scores: { "Design patterns": 0 },
      promotedPatterns: ["state"],
    });
    expect(result.selected).toEqual(["php-architecture", "php-pattern-state"]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../src/routing/classifier.js";
import { selectSkills } from "../src/routing/selector.js";

const CURRENT_PHASE = 2;

const contentLengths = new Map([
  ["php-architecture", 1000],
  ["php-testing", 900],
  ["php-security", 800],
  ["php-standards", 700],
  ["php-debug", 600],
  ["php-composer", 600],
  ["php-modernize", 600],
  ["php-static-analysis", 600],
  ["php-design-patterns", 4200],
  ["php-pattern-strategy", 2400],
  ["php-pattern-adapter", 2400],
  ["php-pattern-decorator", 2400],
  ["php-pattern-state", 2400],
]);

interface CorpusCase {
  id: string;
  prompt: string;
  expected: string[];
  enabledInPhase: number;
  reason?: string;
  files?: string[];
  noPhpContext?: boolean;
  agent?: string;
}

const cases: CorpusCase[] = JSON.parse(
  readFileSync(new URL("./fixtures/routing-corpus.json", import.meta.url), "utf8"),
);

function selectForCorpus(c: CorpusCase): string[] {
  const files: string[] = c.noPhpContext ? [] : (c.files ?? ["src/Example.php"]);
  const current = classify({
    prompt: c.prompt,
    files,
    agent: c.agent ?? null,
    profile: null,
    state: null,
  });
  return selectSkills({
    prompt: c.prompt,
    intents: current.intents,
    concerns: current.concerns,
    maintainSubtype: current.maintainSubtype,
    questionForm: current.questionForm,
    explicit: [],
    activated: new Set<string>(),
    unactivated: [],
    config: { maxSkills: 3, maxSkillChars: 12000 },
    contentLengths,
    scores: current.scores,
    promotedPatterns: current.promotedPatterns,
  }).selected;
}

describe("routing corpus", () => {
  it("contains every spec case R01-R50", () => {
    const ids = new Set(cases.map((c) => c.id));
    for (let i = 1; i <= 50; i += 1) {
      expect(ids.has(`R${String(i).padStart(2, "0")}`)).toBe(true);
    }
  });

  it("gives every future-phase case a reason", () => {
    for (const c of cases.filter((x) => x.enabledInPhase > CURRENT_PHASE)) {
      expect(c.reason).toBeDefined();
    }
  });

  for (const c of cases.filter((x) => x.enabledInPhase <= CURRENT_PHASE)) {
    it(c.id, () => {
      expect(new Set(selectForCorpus(c))).toEqual(new Set(c.expected));
    });
  }
});

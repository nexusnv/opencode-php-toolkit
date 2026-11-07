import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../src/routing/classifier.js";
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
  }).selected;
}

describe("phase 1 routing corpus", () => {
  it("contains every spec case R01-R49", () => {
    const ids = new Set(cases.map((c) => c.id));
    for (let i = 1; i <= 49; i += 1) {
      expect(ids.has(`R${String(i).padStart(2, "0")}`)).toBe(true);
    }
  });

  it("gives every Phase 2 case a reason", () => {
    for (const c of cases.filter((x) => x.enabledInPhase > 1)) {
      expect(c.reason).toBe("pattern-library-not-shipped");
    }
  });

  for (const c of cases.filter((x) => x.enabledInPhase <= 1)) {
    it(c.id, () => {
      expect(new Set(selectForCorpus(c))).toEqual(new Set(c.expected));
    });
  }

  it("keeps R20's shipped selection even though its pattern skill is deferred", () => {
    const r20 = cases.find((c) => c.id === "R20");
    expect(r20).toBeDefined();
    expect(selectForCorpus(r20 as CorpusCase)).toContain("php-architecture");
  });
});

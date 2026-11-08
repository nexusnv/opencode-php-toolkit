# Reactive Engineering Phase 2 Pattern Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the Phase 2 pattern library and risk-based architecture behavior from `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md`: a problem-first `php-design-patterns` index, four hidden P0 pattern skills, long-tail references, deterministic pattern selection, architecture guidance in the state part, and the full routing corpus.

**Architecture:** Extend the Phase 1 catalog/classifier/selector contract without changing its shape: the classifier records promoted pattern names, the selector chooses the index or up to two core pattern skills deterministically, and the content loader registers the four core pattern skills with `autoinvoke: false`. Pattern references are markdown files read on demand; they never count against the attachment budget.

**Tech Stack:** TypeScript ESM, `@opencode/plugin@2.0.26`, Node 20+, Vitest, existing markdown skill conventions.

---

## Phase boundary

Included:

- `php-design-patterns` index skill with the problem-first table, guardrails and at-most-two-references instruction.
- Four hidden core pattern skills: `php-pattern-strategy`, `php-pattern-adapter`, `php-pattern-decorator`, `php-pattern-state`.
- Long-tail references under `skills/php-design-patterns/references/`, including repository and ports-adapters.
- Pattern-name extraction and deterministic pattern selection.
- Risk/strict architecture guidance in the state system part.
- Catalog/content validation tests and the full routing corpus.
- README, CHANGELOG and version `0.3.0`.

Not included:

- P1 promoted pattern skills (observer, builder, factory-method, repository, ports-adapters); they remain index references.
- `php_verify`, architecture scanner, `/php-design`, `/php-architect`, `php-architect`.
- LLM-assisted routing.

## File structure

### Create

- `skills/php-design-patterns/SKILL.md` — problem-first index and reference router.
- `skills/php-design-patterns/references/*.md` — long-tail references.
- `skills/php-pattern-strategy/SKILL.md` — hidden strategy core skill.
- `skills/php-pattern-adapter/SKILL.md` — hidden adapter core skill.
- `skills/php-pattern-decorator/SKILL.md` — hidden decorator core skill.
- `skills/php-pattern-state/SKILL.md` — hidden state core skill.
- `test/pattern-library.test.ts` — catalog/content validation.

### Modify

- `src/routing/types.ts` — promoted pattern names and pattern field on `ClassificationResult`.
- `src/routing/signals.ts` — promoted pattern name signals.
- `src/routing/catalog.ts` — catalog kinds and pattern entries.
- `src/routing/classifier.ts` — record promoted pattern names.
- `src/routing/selector.ts` — index/core pattern selection.
- `src/routing/orchestrator.ts` — pass promoted patterns to the selector.
- `src/content.ts` — new skill IDs and hidden set.
- `src/index.ts` — `autoinvoke: false` for hidden skills.
- `src/context/parts.ts` — architecture guidance by mode.
- `src/config.ts` — phase comment only.
- `test/router-classifier.test.ts`, `test/router-selector.test.ts`, `test/context-parts.test.ts`, `test/plugin-integration.test.ts`, `test/routing-signals.test.ts`, `test/routing-corpus.test.ts`.
- `test/fixtures/routing-corpus.json` — unlock phase 2 cases and remove stale reasons.
- `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`.

---

### Task 1: Add promoted pattern types and signals

**Files:**
- Modify: `src/routing/types.ts`
- Modify: `src/routing/signals.ts`

- [x] **Step 1: Add the promoted pattern type and classification field**

In `src/routing/types.ts`, after `MaintainSubtype`:

```ts
export const PROMOTED_PATTERNS = ["strategy", "adapter", "decorator", "state"] as const;
export type PromotedPattern = (typeof PROMOTED_PATTERNS)[number];
```

Add to `ClassificationResult`:

```ts
  /** Promoted pattern names found in the prompt, strongest first. */
  promotedPatterns: PromotedPattern[];
```

- [x] **Step 2: Add pattern-name signals**

In `src/routing/signals.ts`, import `PromotedPattern` and add:

```ts
export interface PatternNameSignal {
  name: PromotedPattern;
  term: string;
  weight: 1 | 2 | 3;
}

// Bare names score 2; the explicit "<name> pattern" phrase scores 3.
// "state machine" is a state-pattern signal because the corpus uses it.
export const PATTERN_NAME_SIGNALS: readonly PatternNameSignal[] = [
  { name: "strategy", term: "strategy pattern", weight: 3 },
  { name: "strategy", term: "strategy", weight: 2 },
  { name: "adapter", term: "adapter pattern", weight: 3 },
  { name: "adapter", term: "adapter", weight: 2 },
  { name: "decorator", term: "decorator pattern", weight: 3 },
  { name: "decorator", term: "decorator", weight: 2 },
  { name: "state", term: "state pattern", weight: 3 },
  { name: "state", term: "state machine", weight: 2 },
  { name: "state", term: "state", weight: 2 },
];
```

- [x] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: failures only where `ClassificationResult` objects are missing `promotedPatterns`; Task 2 fixes them.

- [x] **Step 4: Commit**

```bash
git add src/routing/types.ts src/routing/signals.ts
git commit -m "feat: add promoted pattern names to routing types and signals"
```

---

### Task 2: Record promoted pattern names in the classifier

**Files:**
- Modify: `src/routing/classifier.ts`
- Test: `test/router-classifier.test.ts`
- Test: `test/routing-signals.test.ts`

- [x] **Step 1: Write failing classifier tests**

Add to `test/router-classifier.test.ts`:

```ts
it("records promoted pattern names strongest first", () => {
  const two = classify({ prompt: "Refactor to the Strategy pattern and add an adapter.", ...base });
  expect(two.promotedPatterns).toEqual(["strategy", "adapter"]);

  const one = classify({ prompt: "Explain the Strategy pattern.", ...base });
  expect(one.promotedPatterns).toEqual(["strategy"]);
  expect(one.questionForm).toBe(true);

  const generic = classify({ prompt: "Improve the design pattern usage.", ...base });
  expect(generic.promotedPatterns).toEqual([]);
});

it("records state machine as a state-pattern signal", () => {
  const result = classify({ prompt: "Refactor the switch into a state machine.", ...base });
  expect(result.promotedPatterns).toEqual(["state"]);
});
```

Add to `test/routing-signals.test.ts`:

```ts
it("keeps promoted pattern signals at their required weight", () => {
  const pairs = PATTERN_NAME_SIGNALS.map((entry) => `${entry.name}:${entry.term}:${entry.weight}`);
  expect(pairs).toContain("strategy:strategy pattern:3");
  expect(pairs).toContain("adapter:adapter:2");
  expect(pairs).toContain("decorator:decorator pattern:3");
  expect(pairs).toContain("state:state machine:2");
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/router-classifier.test.ts test/routing-signals.test.ts`
Expected: FAIL because `promotedPatterns` and `PATTERN_NAME_SIGNALS` do not exist.

- [x] **Step 3: Implement extraction**

In `src/routing/classifier.ts`, import `PATTERN_NAME_SIGNALS` and `PROMOTED_PATTERNS`, then add:

```ts
function promotedPatternsIn(working: string): PromotedPattern[] {
  const best = new Map<PromotedPattern, number>();
  for (const signal of PATTERN_NAME_SIGNALS) {
    if (!termToRegex(signal.term).test(working)) continue;
    best.set(signal.name, Math.max(best.get(signal.name) ?? 0, signal.weight));
  }
  return [...best.entries()]
    .sort((a, b) => {
      const byWeight = b[1] - a[1];
      if (byWeight !== 0) return byWeight;
      return PROMOTED_PATTERNS.indexOf(a[0]) - PROMOTED_PATTERNS.indexOf(b[0]);
    })
    .map(([name]) => name);
}
```

Set `const promotedPatterns = phpContext ? promotedPatternsIn(withoutExplicit) : [];` and include `promotedPatterns` in both `ClassificationResult` returns (`[]` for no PHP context).

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/router-classifier.test.ts test/routing-signals.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/routing/classifier.ts test/router-classifier.test.ts test/routing-signals.test.ts
git commit -m "feat: record promoted pattern names during classification"
```

---

### Task 3: Add the pattern catalog

**Files:**
- Modify: `src/routing/catalog.ts`
- Test: `test/router-selector.test.ts` (compile check)

- [x] **Step 1: Replace the catalog definition**

```ts
import type { PromotedPattern, Target } from "./types.js";

export type CatalogKind = "concern" | "pattern-index" | "pattern-core";

export interface CatalogEntry {
  id: string;
  target: Target;
  order: number;
  kind: CatalogKind;
  pattern?: PromotedPattern;
}

export const CATALOG: readonly CatalogEntry[] = [
  { id: "php-architecture", target: "Architecture", order: 10, kind: "concern" },
  { id: "php-security", target: "Security", order: 20, kind: "concern" },
  { id: "php-testing", target: "Testing", order: 30, kind: "concern" },
  { id: "php-debug", target: "Debugging", order: 40, kind: "concern" },
  { id: "php-static-analysis", target: "Static analysis", order: 50, kind: "concern" },
  { id: "php-standards", target: "Coding standards", order: 60, kind: "concern" },
  { id: "php-composer", target: "Dependencies", order: 70, kind: "concern" },
  { id: "php-design-patterns", target: "Design patterns", order: 80, kind: "pattern-index" },
  { id: "php-pattern-strategy", target: "Design patterns", order: 81, kind: "pattern-core", pattern: "strategy" },
  { id: "php-pattern-adapter", target: "Design patterns", order: 82, kind: "pattern-core", pattern: "adapter" },
  { id: "php-pattern-decorator", target: "Design patterns", order: 83, kind: "pattern-core", pattern: "decorator" },
  { id: "php-pattern-state", target: "Design patterns", order: 84, kind: "pattern-core", pattern: "state" },
];

const PRIMARY_CONCERN_ENTRIES = CATALOG.filter((entry) => entry.kind !== "pattern-core");

export const CONCERN_SKILL_BY_TARGET: ReadonlyMap<Target, CatalogEntry> = new Map(
  PRIMARY_CONCERN_ENTRIES.map((entry) => [entry.target, entry]),
);

export const PATTERN_INDEX: CatalogEntry = CATALOG.find(
  (entry) => entry.kind === "pattern-index",
) as CatalogEntry;

export const PATTERN_CORE_BY_NAME: ReadonlyMap<PromotedPattern, CatalogEntry> = new Map(
  CATALOG.filter(
    (entry): entry is CatalogEntry & { pattern: PromotedPattern } =>
      entry.kind === "pattern-core" && entry.pattern !== undefined,
  ).map((entry) => [entry.pattern, entry]),
);
```

- [x] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (catalog consumers still compile).

- [x] **Step 3: Commit**

```bash
git add src/routing/catalog.ts
git commit -m "feat: add pattern index and core entries to the routing catalog"
```

---

### Task 4: Select pattern skills deterministically

**Files:**
- Modify: `src/routing/selector.ts`
- Modify: `src/routing/orchestrator.ts`
- Test: `test/router-selector.test.ts`

- [x] **Step 1: Write failing selector tests**

Add to `test/router-selector.test.ts`:

```ts
const patternLengths = new Map(contentLengths);
patternLengths.set("php-design-patterns", 4200);
for (const id of ["php-pattern-strategy", "php-pattern-adapter", "php-pattern-decorator", "php-pattern-state"]) {
  patternLengths.set(id, 2400);
}

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
  expect(result.selected).toEqual(["php-architecture", "php-design-patterns"]);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/router-selector.test.ts`
Expected: FAIL: `promotedPatterns` is not accepted and pattern skills are never selected.

- [x] **Step 3: Implement pattern selection**

In `src/routing/selector.ts`:

```ts
import { PATTERN_CORE_BY_NAME, PATTERN_INDEX } from "./catalog.js";
import type { ..., PromotedPattern } from "./types.js";
```

Add to `SelectorInput`:

```ts
  promotedPatterns?: readonly PromotedPattern[];
```

Inside `selectSkills`, after `coSkillsFor` and `effectiveIntents`:

```ts
  const patternChoices = (): Array<{ id: string; reason: string }> => {
    const patterns = input.promotedPatterns ?? [];
    const patternsScore = scores?.["Design patterns"] ?? 0;
    const design = effectiveIntents.includes("Design");
    const actionable = effectiveIntents.some(
      (intent) => intent === "Build" || intent === "Design" || intent === "Review" || intent === "Maintain",
    );
    // Comparisons and knowledge questions with two names use the index.
    if (questionForm && patterns.length >= 2 && !actionable) {
      return [{ id: PATTERN_INDEX.id, reason: "pattern:index" }];
    }
    if (patterns.length === 0) {
      if (design || patternsScore >= 2) {
        return [{ id: PATTERN_INDEX.id, reason: "pattern:index" }];
      }
      return [];
    }
    if (!design && patternsScore < 2) return [];
    if (patterns.length >= 2 && !actionable) {
      return [{ id: PATTERN_INDEX.id, reason: "pattern:index" }];
    }
    const wanted = patterns.slice(0, actionable ? 2 : 1);
    const out: Array<{ id: string; reason: string }> = [];
    for (const name of wanted) {
      const entry = PATTERN_CORE_BY_NAME.get(name);
      if (entry) out.push({ id: entry.id, reason: `pattern:${name}` });
    }
    return out;
  };
```

After the co-skill loop (outside the `if (!questionForm)` block):

```ts
  for (const choice of patternChoices()) {
    coSkillSet.add(choice.id);
    tryAdd(choice.id, choice.reason);
  }
```

In `src/routing/orchestrator.ts`, pass:

```ts
    promotedPatterns: current.promotedPatterns,
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/router-selector.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/routing/selector.ts src/routing/orchestrator.ts test/router-selector.test.ts
git commit -m "feat: select index or core pattern skills deterministically"
```

---

### Task 5: Register and hide the new skills

**Files:**
- Modify: `src/content.ts`
- Modify: `src/index.ts`
- Test: `test/plugin-integration.test.ts`

- [x] **Step 1: Extend skill IDs and hidden set**

In `src/content.ts`:

```ts
export const SKILL_IDS = [
  "php-standards",
  "php-static-analysis",
  "php-testing",
  "php-security",
  "php-modernize",
  "php-composer",
  "php-architecture",
  "php-debug",
  "php-design-patterns",
  "php-pattern-strategy",
  "php-pattern-adapter",
  "php-pattern-decorator",
  "php-pattern-state",
] as const;

export const HIDDEN_SKILL_IDS: ReadonlySet<string> = new Set([
  "php-pattern-strategy",
  "php-pattern-adapter",
  "php-pattern-decorator",
  "php-pattern-state",
]);
```

- [x] **Step 2: Use the hidden set when registering**

In `src/index.ts`, import `HIDDEN_SKILL_IDS` and change:

```ts
autoinvoke: !HIDDEN_SKILL_IDS.has(s.id),
```

- [x] **Step 3: Add integration coverage**

In `test/plugin-integration.test.ts`:

```ts
it("attaches a core pattern skill for a narrow pattern prompt", async () => {
  const { fake, cleanup } = await setupPlugin();
  const event = promptEvent("s1", "Add a decorator around the payment gateway.", { files: phpFile });
  await fake.triggerPromptHook(event);
  const ids = event.prompt.skills?.map((skill) => skill.id) ?? [];
  expect(ids).toContain("php-pattern-decorator");
  expect(ids).not.toContain("php-design-patterns");
  await cleanup();
});

it("registers core pattern skills as hidden and the index as advertised", async () => {
  const { fake, cleanup } = await setupPlugin();
  const registered = [...fake.skills] as Array<{ id: string; autoinvoke: boolean }>;
  const byId = new Map(registered.map((skill) => [skill.id, skill]));
  expect(byId.get("php-design-patterns")?.autoinvoke).toBe(true);
  expect(byId.get("php-pattern-strategy")?.autoinvoke).toBe(false);
  expect(byId.get("php-pattern-adapter")?.autoinvoke).toBe(false);
  expect(byId.get("php-pattern-decorator")?.autoinvoke).toBe(false);
  expect(byId.get("php-pattern-state")?.autoinvoke).toBe(false);
  await cleanup();
});
```

- [x] **Step 4: Run the integration tests**

Run: `npm test -- test/plugin-integration.test.ts`
Expected: FAIL until the skill files exist (Task 6). Add the files first if needed.

- [x] **Step 5: Commit after Task 6**

---

### Task 6: Write the index and core pattern skills

**Files:**
- Create: `skills/php-design-patterns/SKILL.md`
- Create: `skills/php-pattern-strategy/SKILL.md`
- Create: `skills/php-pattern-adapter/SKILL.md`
- Create: `skills/php-pattern-decorator/SKILL.md`
- Create: `skills/php-pattern-state/SKILL.md`

- [x] **Step 1: Write the index skill**

`skills/php-design-patterns/SKILL.md` must contain frontmatter with a trigger-rich description, then:

- The problem→pattern table from spec §8.1.
- The guardrails from spec §8.4.
- A "Read at most two references" instruction.
- A list of reference files with one-line descriptions.
- The pattern selection rule from spec §8.6.

- [x] **Step 2: Write the four core skills**

Each core skill uses this shape:

```markdown
---
name: PHP <Pattern> Pattern
description: <problem-first trigger description>. Use when <specific pain>.
---

# PHP <Pattern> Pattern

## Problem
## Forces
## Solution (PHP 8.1+)
## Trade-offs
## When not to use
## Testing
## Refactoring path
## Related patterns
```

Include one short PHP 8.1+ code example per skill (readonly DTOs, enums, first-class callables where natural). Keep each under ~3,000 characters so two cores plus architecture fit the default budget.

- [x] **Step 3: Run the integration tests**

Run: `npm test -- test/plugin-integration.test.ts`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add skills/php-design-patterns/SKILL.md skills/php-pattern-*/SKILL.md src/content.ts src/index.ts test/plugin-integration.test.ts
git commit -m "feat: add the pattern index and hidden P0 core skills"
```

---

### Task 7: Add long-tail pattern references

**Files:**
- Create: `skills/php-design-patterns/references/repository.md`
- Create: `skills/php-design-patterns/references/ports-adapters.md`
- Create: `skills/php-design-patterns/references/{command,composite,facade,proxy,chain-of-responsibility,specification,unit-of-work,cqrs,event-sourcing,ddd-tactical,anti-corruption-layer,strangler-fig,null-object,template-method,visitor,iterator,mediator,memento,flyweight,bridge,abstract-factory,prototype,singleton,object-pool,dependency-injection,enums-as-state,readonly-dto,named-constructors,first-class-callables,generators,attributes,traits-vs-composition}.md`

- [x] **Step 1: Use the mandatory reference template**

Every file must contain exactly these headings:

```markdown
# <Pattern>

## Problem
## Forces
## Solution (PHP 8.1+)
## Trade-offs
## When not to use
## Testing
## Refactoring path
## Related patterns
```

The "When not to use" and "Testing" sections are mandatory and must be substantive, not one-liners. Each file ends with a short list of related references.

- [x] **Step 2: Keep the two Phase 2-specific references explicit**

`repository.md` must state that a simple persistence service or DAO is often enough and that Repository is not promoted in P0. `ports-adapters.md` must distinguish the architectural boundary from the Adapter pattern and point back to `php-architecture`.

- [x] **Step 3: Commit**

```bash
git add skills/php-design-patterns/references
git commit -m "docs: add long-tail pattern references"
```

---

### Task 8: Add architecture guidance to the state part

**Files:**
- Modify: `src/context/parts.ts`
- Test: `test/context-parts.test.ts`

- [x] **Step 1: Write failing tests**

In `test/context-parts.test.ts`, add cases asserting:

- `state.mode === "risk"` renders `Architecture: risk mode` and mentions one-line rationale, 2–3 lines, and approval.
- `state.mode === "strict"` renders `Architecture: strict mode` and mentions a design note and approval.
- `state.mode === "off"` does not render an `Architecture:` line.

- [x] **Step 2: Implement the guidance**

In `renderToolkitStatePart`, after the `Task:` line:

```ts
  const architecture =
    state.mode === "risk"
      ? "Architecture: risk mode — small reversible changes proceed with a one-line rationale; moderate changes state the chosen pattern and trade-off first; significant boundary, persistence, events, DI or breaking API changes need 2–3 options and approval."
      : state.mode === "strict"
        ? "Architecture: strict mode — present a design note and wait for approval before implementation."
        : null;
  if (architecture) lines.push(architecture);
```

- [x] **Step 3: Run the tests**

Run: `npm test -- test/context-parts.test.ts`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/context/parts.ts test/context-parts.test.ts
git commit -m "feat: add risk-based architecture guidance to the state part"
```

---

### Task 9: Add catalog/content validation tests

**Files:**
- Create: `test/pattern-library.test.ts`

- [x] **Step 1: Write the validation test**

The test imports `CATALOG`, `PATTERN_CORE_BY_NAME`, `PATTERN_INDEX`, `HIDDEN_SKILL_IDS`, `SKILL_IDS` and reads the skill files from disk. It asserts:

```ts
it("maps every skill ID to a catalog entry and a markdown file", () => {
  const catalogIDs = new Set(CATALOG.map((entry) => entry.id));
  for (const id of SKILL_IDS) {
    expect(catalogIDs.has(id)).toBe(true);
    expect(existsSync(join(PKG_ROOT, "skills", id, "SKILL.md"))).toBe(true);
  }
});

it("keeps the index advertised and every core pattern hidden", () => {
  expect(HIDDEN_SKILL_IDS.has(PATTERN_INDEX.id)).toBe(false);
  for (const entry of PATTERN_CORE_BY_NAME.values()) {
    expect(HIDDEN_SKILL_IDS.has(entry.id)).toBe(true);
  }
});

it("gives every reference the mandatory sections", () => {
  const required = [
    "## Problem",
    "## Forces",
    "## Solution (PHP 8.1+)",
    "## Trade-offs",
    "## When not to use",
    "## Testing",
    "## Refactoring path",
    "## Related patterns",
  ];
  for (const file of readdirSync(referenceDir).filter((name) => name.endsWith(".md"))) {
    const text = readFileSync(join(referenceDir, file), "utf8");
    for (const section of required) expect(text).toContain(section);
  }
});

it("does not promote Repository in P0", () => {
  expect([...PATTERN_CORE_BY_NAME.keys()]).toEqual(["strategy", "adapter", "decorator", "state"]);
  const repository = readFileSync(join(referenceDir, "repository.md"), "utf8");
  expect(repository).toContain("simple persistence service");
});
```

- [x] **Step 2: Run the test**

Run: `npm test -- test/pattern-library.test.ts`
Expected: PASS after Tasks 6 and 7.

- [x] **Step 3: Commit**

```bash
git add test/pattern-library.test.ts
git commit -m "test: validate the pattern catalog and reference template"
```

---

### Task 10: Unlock the full routing corpus

**Files:**
- Modify: `test/fixtures/routing-corpus.json`
- Modify: `test/routing-corpus.test.ts`

- [x] **Step 1: Remove stale phase gating reasons**

For every case with `"enabledInPhase": 2`, keep the phase but delete `"reason": "pattern-library-not-shipped"`. Pattern cases are now assertable in Phase 2.

- [x] **Step 2: Update the corpus harness**

In `test/routing-corpus.test.ts`:

```ts
const CURRENT_PHASE = 2;
```

Add content lengths for the index and core skills:

```ts
  ["php-design-patterns", 4200],
  ["php-pattern-strategy", 2400],
  ["php-pattern-adapter", 2400],
  ["php-pattern-decorator", 2400],
  ["php-pattern-state", 2400],
```

Pass `promotedPatterns: current.promotedPatterns` to `selectSkills`.

Change the reason test to future phases:

```ts
it("gives every future-phase case a reason", () => {
  for (const c of cases.filter((x) => x.enabledInPhase > CURRENT_PHASE)) {
    expect(c.reason).toBeDefined();
  }
});
```

Change the loop to:

```ts
for (const c of cases.filter((x) => x.enabledInPhase <= CURRENT_PHASE)) {
```

- [x] **Step 3: Run the corpus**

Run: `npm test -- test/routing-corpus.test.ts`
Expected: PASS for all R01–R50. If a case fails, fix the signal/selection rule, not the expected set.

- [x] **Step 4: Commit**

```bash
git add test/fixtures/routing-corpus.json test/routing-corpus.test.ts
git commit -m "test: unlock the full routing corpus for phase 2"
```

---

### Task 11: Update documentation and version

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/config.ts`

- [x] **Step 1: Update README**

Change the skills section to list the 13 shipped skills: the eight existing, the advertised `php-design-patterns` index, and the four hidden core pattern skills. Document the pattern routing rule: index by default, one core skill for one named promoted pattern, at most two cores for two names, comparisons use the index, at most two references are read on demand. Add a short note that Repository and Ports & Adapters are references, not promoted skills.

- [x] **Step 2: Update CHANGELOG and version**

Add a `0.3.0` entry describing the pattern library, architecture modes, corpus unlock and hidden core skills. Run:

```bash
npm version 0.3.0 --no-git-tag-version
```

- [x] **Step 3: Update the config comment**

In `src/config.ts`, replace the Phase 1-only comment on `architectureMode` with a Phase 2 description: `risk` gives risk-based guidance, `strict` always asks for a design note, `off` disables the gate.

- [x] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md package.json package-lock.json src/config.ts
git commit -m "docs: document the phase 2 pattern library and bump to 0.3.0"
```

---

### Task 12: Full verification

- [x] **Step 1: Run the shared gates**

```bash
npm ci
npm run typecheck
npm test
npm run build
git add -A -- dist && git diff --cached --exit-code -- dist
node -e "import('./dist/index.js').then(m => { if (m.default.id !== 'php-toolkit') process.exit(1) })"
npm pack --dry-run
```

- [x] **Step 2: Confirm dist is rebuilt and committed**

If the staging comparison reports changes, commit the rebuilt `dist/` with the source change.

- [x] **Step 3: Submit the stacked PR**

```bash
gh stack submit --auto --open
```

Update the PR body with the phase 2 deliverables, exit gate, and test evidence.

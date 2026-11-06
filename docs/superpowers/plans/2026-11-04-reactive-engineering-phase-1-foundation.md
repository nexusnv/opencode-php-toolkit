# Reactive Engineering Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 1 foundation from `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md`: deterministic L0 constitution, per-session project profile, intent×concern routing, task-generation boundaries, activation-aware skill attachment, storage, diagnostics, and metrics v3.

**Architecture:** Keep the existing plugin registration style (`Plugin.define` + transforms), but move routing into focused modules under `src/routing/`. The prompt hook becomes a deterministic classifier and selector; the context hook renders L0 plus one compact state part; `session.skill.activated` is the only proof a skill loaded. Phase 1 ships only the eight existing skills and does **not** implement pattern skills, `php_verify`, the architecture scanner or LLM routing.

**Tech Stack:** TypeScript ESM, `@opencode/plugin@2.0.26` (locked contract), Node 20+, Vitest, existing PHP fixture conventions, `@opencode/client@2.0.26` generated API types only through the curated plugin context.

---

## Phase boundary

Included:

- L0 constitution.
- Per-session `ProjectProfile`, application/library classification, cache by root+subpath.
- Routing catalog for the eight existing skills.
- Deterministic signal dictionary, classifier, concern gating, conflict resolution and selector.
- Task-generation state machine and continuation/reset rules.
- Prompt hook attachment with explicit `@skill-id` preservation.
- Selected/attached/activated/pending/awaiting-approval/denied state model.
- `session.skill.activated` and `session.permissions` subscriptions.
- Best-effort `ctx.storage` state persistence.
- Separate `session.hook("compaction")`; no-op by default.
- `/php-toolkit-status` diagnostics.
- Metrics v3 migration.
- Fixtures, unit tests, Phase 1 routing corpus and acceptance checks.

Not included:

- `php-design-patterns`, core pattern skills or references.
- `php_verify`, changed-file scope, verification statuses.
- `php_architecture_scan`, `php-toolkit.json` boundaries, architecture cache.
- `php-architect`, `/php-design`, `/php-architect`.
- LLM-assisted classification.
- Any dependency on experimental `session.instructions.entry` from plugin 2.2.x.

The full spec routing corpus is unlocked in Phase 2. Phase 1 tests the Phase 1-capable subset; every disabled case must state why: `pattern-library-not-shipped`.

## Source references

- Spec: `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md`
  - §4 Architecture
  - §5 Project Profile
  - §6 Constitution
  - §7 Routing
  - §12 Surfaces (Phase 1 commands/tools/hooks)
  - §13 Configuration
  - §14 Metrics
  - §15 Testing and evaluation
  - §16 Phase 1 acceptance criteria
  - §17 Migration
  - §19 Validation assumptions 1–15
- Roadmap: `docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md`
- Plugin contract verified 2026-11-04:
  - `session.hook("context")` receives `SessionContext`; there is no `kind: "compaction"`.
  - `session.hook("compaction")` is a separate hook.
  - Locked `@opencode/plugin@2.0.26` does not expose `ctx.session.instructions`.
  - `ctx.vcs.status({ location: { directory } })` returns `{ location, data: [{ file, additions, deletions, status }] }`; Phase 1 does not use it, but do not implement a private Git parser later in its place.

## File structure

### Create

- `src/constitution.ts` — exact L0 constitution text.
- `src/config.ts` — plugin options validation and defaults.
- `src/profile.ts` — `ProjectProfile`, fixture-independent profile builder, cache.
- `src/routing/types.ts` — shared intent/concern/state types.
- `src/routing/signals.ts` — signal dictionary and fixed priority orders.
- `src/routing/classifier.ts` — scoring, gating, conflict resolution.
- `src/routing/task-boundary.ts` — continuation/reset/task generation transition.
- `src/routing/catalog.ts` — eight-skill catalog and selection metadata.
- `src/routing/selector.ts` — budget selection and permission-aware filtering.
- `src/routing/state.ts` — in-memory state, task merge rules, status rendering data.
- `src/routing/persistence.ts` — storage schema, hydration, serialization.
- `src/routing/orchestrator.ts` — per-prompt routing pipeline.
- `src/routing/permissions.ts` — skill-rule interpretation.
- `src/routing/events.ts` — activation and permission event reconciliation.
- `src/context/parts.ts` — render/remove L0 and state system parts.
- `src/status/toolkit-status.ts` — diagnostics snapshot and renderer.
- `commands/php-toolkit-status.md` — command template/fallback.
- `test/fixtures/routing-corpus.json` — Phase 1 corpus contract.
- `fixtures/php-app/`
- `fixtures/php-app-no-type/`
- `fixtures/php-library/`
- `fixtures/php-library-no-type/`
- `fixtures/php-legacy/`
- `fixtures/php-framework/`
- `fixtures/php-no-tools/`
- `test/config.test.ts`
- `test/constitution.test.ts`
- `test/metrics-v3.test.ts`
- `test/profile.test.ts`
- `test/routing-signals.test.ts`
- `test/router-classifier.test.ts`
- `test/task-boundary.test.ts`
- `test/router-selector.test.ts`
- `test/session-state.test.ts`
- `test/permissions.test.ts`
- `test/orchestrator.test.ts`
- `test/permission-events.test.ts`
- `test/plugin-integration.test.ts`
- `test/context-parts.test.ts`
- `test/toolkit-status.test.ts`
- `test/routing-corpus.test.ts`

### Modify

- `src/metrics/store.ts` — v3 schema and empty sections.
- `src/metrics/registry.ts` — `recordRouting` and exports for metrics v3.
- `src/metrics/format.ts` — render routing summary.
- `src/content.ts` — add `php-toolkit-status` command definition.
- `src/index.ts` — register new hooks/command, remove `PHP_SYSTEM_HINT` import.
- `src/hooks/php-context.ts` — remove static hint or re-export removed API; keep `isDestructiveShell`.
- `package.json` — version `0.2.0`.
- `package-lock.json` — version lock.
- `README.md` — behavior, configuration, migration and diagnostics.
- `CHANGELOG.md` — `0.2.0` entry.
- `dist/index.js` and `dist/**` — rebuilt artifacts committed.

### Test

- Existing tests under `test/` must remain green unless explicitly updated for v3/L0.
- New tests use Vitest and temporary directories under `tmpdir()`; no test depends on the developer's real `~/.config/opencode`.

---

## Task 1: Metrics v3 migration

**Files:**
- Modify: `src/metrics/store.ts`
- Modify: `src/metrics/registry.ts`
- Modify: `src/metrics/format.ts`
- Create: `test/metrics-v3.test.ts`
- Modify: existing `test/metrics-store.test.ts`
- Modify: existing `test/metrics-format.test.ts`

- [ ] **Step 1: Write the failing v3 migration test**

```ts
import { describe, expect, it } from "vitest";
import {
  deserialize,
  METRICS_VERSION,
  type MetricsProject,
} from "../src/metrics/store.js";

const project: MetricsProject = { name: "demo", path: "/repo/demo" };

describe("metrics v3", () => {
  it("adds empty routing, verification and scanner sections to v2 documents", () => {
    const { metrics, supported } = deserialize(
      {
        version: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        projectName: "demo",
        projectPath: project.path,
        tools: {},
        commands: {},
        triggerHits: 3,
      },
      project,
    );

    expect(supported).toBe(true);
    expect(metrics.version).toBe(METRICS_VERSION);
    expect(metrics.triggerHits).toBe(3);
    expect(metrics.routing).toEqual({
      selections: {},
      activations: {},
      unactivated: {},
      intents: {},
      concerns: {},
      dropped: {},
      taskGenerations: 0,
      continuations: 0,
      resets: 0,
      announcements: 0,
    });
    expect(metrics.verification).toEqual({
      runs: 0,
      passed: 0,
      failed: 0,
      warning: 0,
      skipped: 0,
      partial: 0,
      unavailable: 0,
      error: 0,
      timedOut: 0,
      cancelled: 0,
      findings: 0,
      lastRunAt: null,
    });
    expect(metrics.scanner).toEqual({
      runs: 0,
      findings: 0,
      hypotheses: 0,
      truncated: 0,
      cacheHits: 0,
      cacheModes: { content: 0, metadata: 0 },
      lastRunAt: null,
    });
  });

  it("refuses to overwrite a newer metrics document", () => {
    const { supported, metrics } = deserialize({ version: METRICS_VERSION + 1 }, project);
    expect(supported).toBe(false);
    expect(metrics.version).toBe(METRICS_VERSION);
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run:

```bash
npx vitest run test/metrics-v3.test.ts -v
```

Expected: FAIL because `METRICS_VERSION` is `2` and the v3 sections do not exist.

- [ ] **Step 3: Add v3 types, empty documents and migration**

Replace the constants and `PhpToolkitMetrics` in `src/metrics/store.ts` with:

```ts
export interface EntryCounter {
  count: number;
  lastUsedAt: string;
}

export interface RoutingMetrics {
  selections: Record<string, EntryCounter>;
  activations: Record<string, EntryCounter>;
  unactivated: Record<string, number>;
  intents: Record<string, number>;
  concerns: Record<string, number>;
  dropped: Record<string, number>;
  taskGenerations: number;
  continuations: number;
  resets: number;
  announcements: number;
}

export interface VerificationMetrics {
  runs: number;
  passed: number;
  failed: number;
  warning: number;
  skipped: number;
  partial: number;
  unavailable: number;
  error: number;
  timedOut: number;
  cancelled: number;
  findings: number;
  lastRunAt: string | null;
}

export interface ScannerMetrics {
  runs: number;
  findings: number;
  hypotheses: number;
  truncated: number;
  cacheHits: number;
  cacheModes: { content: number; metadata: number };
  lastRunAt: string | null;
}

export interface PhpToolkitMetrics {
  version: number;
  startedAt: string;
  projectName: string;
  /** Identity of the document; never displayed or exported. */
  projectPath: string;
  tools: Record<string, ToolMetricEntry>;
  commands: Record<string, CommandMetricEntry>;
  triggerHits: number;
  routing: RoutingMetrics;
  verification: VerificationMetrics;
  scanner: ScannerMetrics;
}

export const METRICS_VERSION = 3;

export function emptyRoutingMetrics(): RoutingMetrics {
  return {
    selections: {},
    activations: {},
    unactivated: {},
    intents: {},
    concerns: {},
    dropped: {},
    taskGenerations: 0,
    continuations: 0,
    resets: 0,
    announcements: 0,
  };
}

export function emptyVerificationMetrics(): VerificationMetrics {
  return {
    runs: 0,
    passed: 0,
    failed: 0,
    warning: 0,
    skipped: 0,
    partial: 0,
    unavailable: 0,
    error: 0,
    timedOut: 0,
    cancelled: 0,
    findings: 0,
    lastRunAt: null,
  };
}

export function emptyScannerMetrics(): ScannerMetrics {
  return {
    runs: 0,
    findings: 0,
    hypotheses: 0,
    truncated: 0,
    cacheHits: 0,
    cacheModes: { content: 0, metadata: 0 },
    lastRunAt: null,
  };
}
```

Update `initialMetrics()`:

```ts
const metrics: PhpToolkitMetrics = {
  version: METRICS_VERSION,
  startedAt: new Date().toISOString(),
  projectName: project.name,
  projectPath: project.path,
  tools: {},
  commands: {},
  triggerHits: 0,
  routing: emptyRoutingMetrics(),
  verification: emptyVerificationMetrics(),
  scanner: emptyScannerMetrics(),
};
```

Update `deserialize()` so older documents are migrated:

```ts
const candidate = raw as Record<string, unknown>;
const version = num(candidate.version) ?? 0;
if (version > METRICS_VERSION) return { metrics: initialMetrics(project), supported: false };
const routing = candidate.routing && typeof candidate.routing === "object"
  ? { ...emptyRoutingMetrics(), ...(candidate.routing as Partial<RoutingMetrics>) }
  : emptyRoutingMetrics();
const verification = candidate.verification && typeof candidate.verification === "object"
  ? { ...emptyVerificationMetrics(), ...(candidate.verification as Partial<VerificationMetrics>) }
  : emptyVerificationMetrics();
const scanner = candidate.scanner && typeof candidate.scanner === "object"
  ? { ...emptyScannerMetrics(), ...(candidate.scanner as Partial<ScannerMetrics>) }
  : emptyScannerMetrics();
const base = initialMetrics(project);
return {
  supported: true,
  metrics: {
    ...base,
    version: METRICS_VERSION,
    startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : base.startedAt,
    projectName: typeof candidate.projectName === "string" ? candidate.projectName : project.name,
    projectPath: typeof candidate.projectPath === "string" ? candidate.projectPath : project.path,
    tools: migrateTools(candidate.tools),
    commands: migrateCommands(candidate.commands),
    triggerHits: nonNegative(num(candidate.triggerHits)),
    routing,
    verification,
    scanner,
  },
};
```

- [ ] **Step 4: Extend the metrics registry API**

Define the shared event type in `src/metrics/store.ts` and re-export it from `src/metrics/registry.ts` so the dependency stays one-way:

```ts
export type RoutingMetricEvent =
  | { kind: "selected"; skill: string }
  | { kind: "activated"; skill: string }
  | { kind: "unactivated"; skill: string }
  | { kind: "dropped"; reason: string }
  | { kind: "intents"; values: string[] }
  | { kind: "concerns"; values: string[] }
  | { kind: "task-generation" }
  | { kind: "continuation" }
  | { kind: "reset" };
```

Add to `MetricsRegistry`:

```ts
async recordRouting(event: RoutingMetricEvent): Promise<void> {
  const store = this.active;
  if (!store) return;
  await store.recordRouting(event);
}
```

Add `routing` to `MetricsDelta` and apply each event directly to the pending delta. The store already uses `this.delta` plus `markDirty()`, so do not introduce a second persistence path:

```ts
async recordRouting(event: RoutingMetricEvent): Promise<void> {
  applyRoutingEvent(this.delta.routing, event, new Date().toISOString());
  this.markDirty();
}
```

Update `emptyDelta()`, `isEmptyDelta()`, `mergeDelta()` and `applyDelta()` so routing counters and `EntryCounter` values merge additively. For `selections`/`activations`, add counts and keep the later `lastUsedAt`. `applyRoutingEvent(target, event, now)` increments the matching counter: `selected`/`activated` update the named `EntryCounter` (`count += 1`, `lastUsedAt = now`), `unactivated`/`dropped`/`intents`/`concerns` increment the named key, and the scalar kinds increment `taskGenerations`, `continuations` or `resets`. The persisted document must remain bounded: never store prompt text, file paths or skill contents. Existing `MetricsDelta` literals in `test/metrics-store.test.ts` must add `routing: emptyRoutingMetrics()`; update the test helper rather than weakening the type.

- [ ] **Step 5: Update rendered metrics output**

Add a concise section below tools/commands:

```text
  Routing
    generations 4   continuations 2   resets 1
    most selected   php-testing (3), php-architecture (2)
    activations     2                 dropped 1
```

Do not list every counter. Keep local diagnostics compact. `export` must include the new sections but omit absolute paths.

- [ ] **Step 6: Run metrics tests**

Run:

```bash
npx vitest run test/metrics-v3.test.ts test/metrics-store.test.ts test/metrics-format.test.ts -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/metrics test/metrics-v3.test.ts test/metrics-store.test.ts test/metrics-format.test.ts
git commit -m "feat: add metrics v3 routing sections"
```

---

## Task 2: Engineering constitution (L0)

**Files:**
- Create: `src/constitution.ts`
- Modify: `src/hooks/php-context.ts`
- Modify: `src/index.ts`
- Create: `test/constitution.test.ts`

- [ ] **Step 1: Write the failing constitution test**

```ts
import { describe, expect, it } from "vitest";
import { L0_CONSTITUTION } from "../src/constitution.js";

describe("L0 constitution", () => {
  it("contains the mandatory engineering principles and PHP defaults", () => {
    expect(L0_CONSTITUTION).toContain("PHP toolkit engineering principles:");
    expect(L0_CONSTITUTION).toContain("Understand the existing code and conventions");
    expect(L0_CONSTITUTION).toContain("Never invent requirements");
    expect(L0_CONSTITUTION).toContain("PHP 8.1+ defaults:");
    expect(L0_CONSTITUTION).toContain("strict_types=1");
    expect(L0_CONSTITUTION).toContain("Rector and CS-Fixer: dry-run first");
  });

  it("does not contain routing instructions that depend on a skill", () => {
    expect(L0_CONSTITUTION).not.toContain("When you see");
    expect(L0_CONSTITUTION).not.toContain("always use Strategy");
  });
});
```

- [ ] **Step 2: Create the exact constitution**

```ts
// src/constitution.ts
export const L0_CONSTITUTION = [
  "PHP toolkit engineering principles:",
  "- Understand the existing code and conventions before changing them.",
  "- Respect existing boundaries unless you can justify changing them.",
  "- Prefer explicit dependencies and clear responsibilities.",
  "- Avoid unnecessary abstractions, interfaces and dependencies.",
  "- Use design patterns to solve a named design problem, not as decoration.",
  "- Prefer simple, idiomatic PHP 8.1+ before reaching for a pattern.",
  "- Design for foreseeable extension, not every hypothetical future.",
  "- Test behavior and verify changes before claiming completion.",
  "- Never invent requirements or claim unverified functionality.",
  "- When a decision has lasting architectural consequences, explain the trade-offs.",
  "",
  "PHP 8.1+ defaults: strict_types=1, typed signatures, PSR-4/PSR-12, PHPStan or Psalm,",
  "PHPUnit or Pest. Rector and CS-Fixer: dry-run first, show the diff, apply only on approval.",
].join("\n");
```

- [ ] **Step 3: Remove the old static hint as a source of truth**

In `src/hooks/php-context.ts`, delete `PHP_SYSTEM_HINT` and `PHP_HINT_TRIGGER` and `mentionsPhp` if the new context hook no longer needs them. Keep `PHP_TRIGGER`: Task 11 still uses it for trigger metrics. Keep `isDestructiveShell` unchanged.

If removal breaks imports, update `src/index.ts` in this task to import `L0_CONSTITUTION` instead.

- [ ] **Step 4: Replace the old hint with L0 in the context hook**

In `src/index.ts`:

- Remove `PHP_SYSTEM_HINT`, `PHP_HINT_TRIGGER` and `mentionsPhp` from the import.
- Import `L0_CONSTITUTION` from `./constitution.js`.
- Replace the context hook body with an unconditional L0 system part:

```ts
track(
  await ctx.session.hook("context", (event) => {
    event.system.push({ type: "text", text: L0_CONSTITUTION });
  }),
);
```

Do not add the routing state part yet; Task 12 owns that. Remove the now-unused `composerJsonExists` helper if it has no other caller.

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run test/constitution.test.ts test/hooks.test.ts -v
```

Expected: PASS. Remove assertions for removed hint exports rather than editing behavior tests that still matter.

- [ ] **Step 6: Commit**

```bash
git add src/constitution.ts src/hooks/php-context.ts src/index.ts test/constitution.test.ts test/hooks.test.ts
git commit -m "feat: replace static hint with L0 constitution"
```

---

## Task 3: Plugin options parsing and escape hatches

**Files:**
- Create: `src/config.ts`
- Create: `test/config.test.ts`

- [ ] **Step 1: Write failing config tests**

```ts
import { describe, expect, it } from "vitest";
import { readToolkitConfig } from "../src/config.js";

describe("readToolkitConfig", () => {
  it("uses least-friction defaults", () => {
    expect(readToolkitConfig(undefined)).toEqual({
      autoSkills: "attach",
      maxSkills: 3,
      maxSkillChars: 12000,
      architectureMode: "risk",
      architectureScan: "tool",
      announceSelections: "off",
      verification: "remind",
    });
  });

  it("accepts valid explicit values", () => {
    expect(readToolkitConfig({ autoSkills: "hint", maxSkills: 4 }).autoSkills).toBe("hint");
    expect(readToolkitConfig({ announceSelections: "on-change" }).announceSelections).toBe("on-change");
  });

  it("falls back field-by-field and warns for invalid values", () => {
    const warnings: string[] = [];
    const config = readToolkitConfig(
      { autoSkills: "everything", maxSkills: 99, maxSkillChars: -1 },
      (message) => warnings.push(message),
    );
    expect(config.autoSkills).toBe("attach");
    expect(config.maxSkills).toBe(3);
    expect(config.maxSkillChars).toBe(12000);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("autoSkills off disables routing but not the constitution", () => {
    expect(readToolkitConfig({ autoSkills: "off" }).autoSkills).toBe("off");
  });
});
```

- [ ] **Step 2: Implement exact parsing**

```ts
// src/config.ts
export interface ToolkitConfig {
  autoSkills: "attach" | "hint" | "off";
  maxSkills: number;
  maxSkillChars: number;
  architectureMode: "risk" | "strict" | "off";
  architectureScan: "tool" | "auto" | "off";
  announceSelections: "on-change" | "always" | "off";
  verification: "remind" | "off";
}

export const DEFAULT_TOOLKIT_CONFIG: ToolkitConfig = {
  autoSkills: "attach",
  maxSkills: 3,
  maxSkillChars: 12_000,
  architectureMode: "risk",
  architectureScan: "tool",
  announceSelections: "off",
  verification: "remind",
};

const bool = (v: unknown): v is boolean => typeof v === "boolean";
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const boundedInt = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.floor(v) : undefined;

export function readToolkitConfig(
  raw: unknown,
  warn: (message: string) => void = (message) => console.warn(`[php-toolkit] ${message}`),
): ToolkitConfig {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_TOOLKIT_CONFIG };
  const take = <T extends string>(key: keyof ToolkitConfig, allowed: readonly T[]) => {
    const value = oneOf(input[key], allowed);
    if (value === undefined && input[key] !== undefined) warn(`invalid ${key}; using default`);
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  };
  take("autoSkills", ["attach", "hint", "off"]);
  take("architectureMode", ["risk", "strict", "off"]);
  take("architectureScan", ["tool", "auto", "off"]);
  take("announceSelections", ["on-change", "always", "off"]);
  take("verification", ["remind", "off"]);
  const maxSkills = boundedInt(input.maxSkills, 1, 4);
  if (maxSkills === undefined && input.maxSkills !== undefined) warn("invalid maxSkills; using default");
  else if (maxSkills !== undefined) out.maxSkills = maxSkills;
  const maxSkillChars = boundedInt(input.maxSkillChars, 1, 100_000);
  if (maxSkillChars === undefined && input.maxSkillChars !== undefined) warn("invalid maxSkillChars; using default");
  else if (maxSkillChars !== undefined) out.maxSkillChars = maxSkillChars;
  return out;
}
```

Phase 1 does not read `php-toolkit.json`. Leave that parsing to Phase 5 and Phase 4 stops — do not add a speculative project-config API now.

- [ ] **Step 3: Run tests**

```bash
npx vitest run test/config.test.ts -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: parse toolkit config with safe defaults"
```

---

## Task 4: Project profile fixtures

**Files:**
- Create: `fixtures/php-app/composer.json`
- Create: `fixtures/php-app/public/index.php`
- Create: `fixtures/php-app/migrations/0001_init.php`
- Create: `fixtures/php-app/src/App.php`
- Create: `fixtures/php-app/tests/AppTest.php`
- Create: `fixtures/php-app-no-type/composer.json`
- Create: `fixtures/php-app-no-type/public/index.php`
- Create: `fixtures/php-app-no-type/migrations/0001_init.php`
- Create: `fixtures/php-app-no-type/src/App.php`
- Create: `fixtures/php-library/composer.json`
- Create: `fixtures/php-library/src/Widget.php`
- Create: `fixtures/php-library/tests/WidgetTest.php`
- Create: `fixtures/php-library/CHANGELOG.md`
- Create: `fixtures/php-library-no-type/composer.json`
- Create: `fixtures/php-library-no-type/src/Widget.php`
- Create: `fixtures/php-library-no-type/tests/WidgetTest.php`
- Create: `fixtures/php-legacy/README.md`
- Create: `fixtures/php-legacy/src/Legacy.php`
- Create: `fixtures/php-framework/composer.json`
- Create: `fixtures/php-framework/src/App.php`
- Create: `fixtures/php-no-tools/composer.json`

- [ ] **Step 1: Create fixture tree with exact content**

Use shell heredocs:

```bash
set -eu
mkdir -p fixtures/php-app/public fixtures/php-app/migrations fixtures/php-app/src fixtures/php-app/tests
cat > fixtures/php-app/composer.json <<'JSON'
{"name":"acme/app","type":"project","require":{"php":"^8.2"},"autoload":{"psr-4":{"Acme\\":"src/"}}}
JSON
cat > fixtures/php-app/public/index.php <<'PHP'
<?php declare(strict_types=1);
PHP
cat > fixtures/php-app/migrations/0001_init.php <<'PHP'
<?php declare(strict_types=1);
PHP
cat > fixtures/php-app/src/App.php <<'PHP'
<?php declare(strict_types=1); namespace Acme; final class App {}
PHP
cat > fixtures/php-app/tests/AppTest.php <<'PHP'
<?php declare(strict_types=1); namespace Acme; final class AppTest {}
PHP
mkdir -p fixtures/php-app-no-type/public fixtures/php-app-no-type/migrations fixtures/php-app-no-type/src
cat > fixtures/php-app-no-type/composer.json <<'JSON'
{"name":"acme/app-no-type","require":{"php":"^8.2"},"autoload":{"psr-4":{"AcmeNoType\\":"src/"}}}
JSON
cat > fixtures/php-app-no-type/public/index.php <<'PHP'
<?php declare(strict_types=1);
PHP
cat > fixtures/php-app-no-type/migrations/0001_init.php <<'PHP'
<?php declare(strict_types=1);
PHP
cat > fixtures/php-app-no-type/src/App.php <<'PHP'
<?php declare(strict_types=1); namespace AcmeNoType; final class App {}
PHP
mkdir -p fixtures/php-library/src fixtures/php-library/tests
cat > fixtures/php-library/composer.json <<'JSON'
{"name":"acme/widget","type":"library","require":{"php":"^8.1"},"autoload":{"psr-4":{"Acme\\Widget\\":"src/"}}}
JSON
cat > fixtures/php-library/src/Widget.php <<'PHP'
<?php declare(strict_types=1); namespace Acme\Widget; final class Widget {}
PHP
cat > fixtures/php-library/tests/WidgetTest.php <<'PHP'
<?php declare(strict_types=1); namespace Acme\Widget; final class WidgetTest {}
PHP
printf '# Changelog\n\n## Unreleased\n' > fixtures/php-library/CHANGELOG.md
mkdir -p fixtures/php-library-no-type/src fixtures/php-library-no-type/tests
cat > fixtures/php-library-no-type/composer.json <<'JSON'
{"name":"acme/widget-no-type","require":{"php":"^8.1"},"autoload":{"psr-4":{"Acme\\NoType\\":"src/"}}}
JSON
cat > fixtures/php-library-no-type/src/Widget.php <<'PHP'
<?php declare(strict_types=1); namespace Acme\NoType; final class Widget {}
PHP
cat > fixtures/php-library-no-type/tests/WidgetTest.php <<'PHP'
<?php declare(strict_types=1); namespace Acme\NoType; final class WidgetTest {}
PHP
mkdir -p fixtures/php-legacy/src
cat > fixtures/php-legacy/README.md <<'MD'
# Legacy PHP project without Composer
MD
cat > fixtures/php-legacy/src/Legacy.php <<'PHP'
<?php class Legacy {}
PHP
cat > fixtures/php-framework/composer.json <<'JSON'
{"name":"acme/framework-app","require":{"php":"^8.2","laravel/framework":"^12.0"},"autoload":{"psr-4":{"Acme\\Framework\\":"src/"}}}
JSON
mkdir -p fixtures/php-framework/src && printf '<?php declare(strict_types=1);\n' > fixtures/php-framework/src/App.php
mkdir -p fixtures/php-no-tools
cat > fixtures/php-no-tools/composer.json <<'JSON'
{"name":"acme/no-tools","require":{"php":"^8.1"}}
JSON
```

- [ ] **Step 2: Verify fixture layout**

Run:

```bash
find fixtures/php-* -maxdepth 2 -type f | sort
```

Expected: all listed files exist.

- [ ] **Step 3: Commit fixtures**

```bash
git add fixtures
git commit -m "test: add project profile fixtures"
```

---

## Task 5: Project profile implementation

**Files:**
- Create: `src/profile.ts`
- Create: `test/profile.test.ts`

- [ ] **Step 1: Write failing profile tests**

```ts
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildProjectProfile, ProjectProfileCache } from "../src/profile.js";

const fixture = (name: string) => resolve("fixtures", name);

describe("buildProjectProfile", () => {
  it("classifies explicit composer type project as application", async () => {
    const p = await buildProjectProfile(fixture("php-app"), null);
    expect(p.type).toBe("application");
    expect(p.typeConfidence).toBe("high");
    expect(p.typeEvidence).toContain("composer:type=project");
    expect(p.layout.hasPublicIndex).toBe(true);
  });

  it("does not classify an application without Composer type as a library", async () => {
    const p = await buildProjectProfile(fixture("php-app-no-type"), null);
    expect(p.type).toBe("application");
    expect(p.typeEvidence).toContain("layout:public-index");
    expect(p.typeEvidence).not.toContain("composer:type=library");
  });

  it("classifies explicit type library as library", async () => {
    const p = await buildProjectProfile(fixture("php-library"), null);
    expect(p.type).toBe("library");
    expect(p.typeConfidence).toBe("high");
    expect(p.typeEvidence).toContain("composer:type=library");
  });

  it("does not force a package-shaped library without enough evidence into library", async () => {
    const p = await buildProjectProfile(fixture("php-library-no-type"), null);
    expect(p.typeEvidence).toContain("layout:package-shape");
    expect(["library", "unknown"]).toContain(p.type);
  });

  it("returns unknown when evidence is insufficient", async () => {
    const p = await buildProjectProfile(fixture("php-legacy"), null);
    expect(p.type).toBe("unknown");
    expect(p.typeEvidence).toContain("layout:no-entry-point");
  });

  it("detects framework runtime as application evidence", async () => {
    const p = await buildProjectProfile(fixture("php-framework"), null);
    expect(p.frameworkHints).toContain("laravel");
    expect(p.typeEvidence).toContain("composer:framework-runtime");
  });

  it("reports no tools without pretending tooling exists", async () => {
    const p = await buildProjectProfile(fixture("php-no-tools"), null);
    expect(p.tools.phpunit).toBe(false);
    expect(p.tools.phpstan).toBe(false);
    expect(p.phpRequirement).toBe("^8.1");
  });
});

describe("ProjectProfileCache", () => {
  it("does not share entries between roots with the same subpath", async () => {
    const cache = new ProjectProfileCache();
    const a = await cache.resolve(fixture("php-library"), null);
    const b = await cache.resolve(fixture("php-library-no-type"), null);
    expect(a.root).not.toBe(b.root);
    expect(cache.size).toBe(2);
  });
});
```

- [ ] **Step 2: Implement `src/profile.ts`**

Use this exact public API:

```ts
export type ProjectType = "application" | "library" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type FrameworkHint = "laravel" | "symfony" | "wordpress" | "none";

export interface ProjectProfile {
  root: string;
  subpath: string | null;
  type: ProjectType;
  typeConfidence: Confidence;
  typeEvidence: string[];
  phpRequirement: string | null;
  hasComposerJson: boolean;
  hasComposerLock: boolean;
  autoloadPsr4: Record<string, string>;
  packageName: string | null;
  packageType: string | null;
  frameworkHints: FrameworkHint[];
  tools: {
    phpunit: boolean; psalm: boolean; pest: boolean; phpstan: boolean; phpcs: boolean;
    csFixer: boolean; rector: boolean; deptrac: boolean; infection: boolean;
  };
  configFiles: {
    phpunit: string | null; pest: string | null; phpstan: string | null; psalm: string | null;
    phpcs: string | null; csFixer: string | null; deptrac: string | null; architecture: string | null;
  };
  layout: {
    sourceRoots: string[]; testRoots: string[]; hasPublicIndex: boolean; hasConsoleBin: boolean;
    hasMigrations: boolean; hasConfigDir: boolean; hasTemplates: boolean;
  };
  fingerprint: string;
  lockFingerprint: string | null;
}
```

Implementation rules:

1. `buildProjectProfile(root, subpath)` calls `detectPhpProject(root)` for dependency/tool detection and reads `composer.json` itself for `name` and `type`.
2. Layout probes use `access()` on:
   - `public/index.php`
   - `bin/console`
   - `config/`
   - `migrations/`
   - `templates/` or `views/`
   - `src/`
   - existing test roots `tests/`, `test/`, `spec/`
   - `CHANGELOG*`, `UPGRADING*`
3. Missing `type` is never a library signal.
4. Scoring table from spec §5 must be implemented literally.
5. Classification thresholds:
   - application: `app >= 3 && app - library >= 2`
   - library: `library >= 3 && library - app >= 2`
   - otherwise unknown
   - high when winning margin `>=4`; medium `2–3`; low for unknown
6. `fingerprint`:
   - Import `readFile` from `node:fs/promises`, `join` from `node:path`, and `PKG_ROOT` from `./content.js`. Read the package version once at module scope:
     ```ts
     const PACKAGE_VERSION = JSON.parse(await readFile(join(PKG_ROOT, "package.json"), "utf8")).version as string;
     ```
   - SHA-256 over `PACKAGE_VERSION`, relative `composer.json` contents if present, and contents of config files found by the profile probe.
   - Include `composer.lock` in a separate `lockFingerprint`; do not hash the lock into the base fingerprint unless the caller wants full invalidation. The resolver refreshes when either value changes.
7. `ProjectProfileCache.resolve(root, subpath)` caches by `${root}\0${subpath ?? ""}`. Cached profile is returned only when both fingerprints match; otherwise rebuilt.
8. Profile includes no prompt text and no file contents.

Use stable evidence codes exactly as the spec:

```text
composer:type=project
composer:type=library
composer:framework-runtime
composer:no-framework-runtime
layout:public-index
layout:console-bin
layout:config-dir
layout:migrations
layout:templates
layout:no-entry-point
layout:package-shape
layout:release-metadata
```

- [ ] **Step 3: Implement profile cache and fingerprint**

```ts
export class ProjectProfileCache {
  #items = new Map<string, ProjectProfile>();
  #layoutMarkerSignatures = new Map<string, string>();
  get size(): number { return this.#items.size; }
  async resolve(root: string, subpath: string | null): Promise<ProjectProfile> {
    const key = cacheKey(root, subpath);
    const cached = this.#items.get(key);
    const freshFingerprint = await computeFingerprint(root);
    const lockFingerprint = await computeLockFingerprint(root);
    const markerSignature = await computeLayoutMarkerSignature(root);
    const cachedLayoutMarkerSignature = this.#layoutMarkerSignatures.get(key);
    if (
      cached &&
      cached.fingerprint === freshFingerprint &&
      cached.lockFingerprint === lockFingerprint &&
      cachedLayoutMarkerSignature === markerSignature
    ) {
      return cached;
    }
    const next = await buildProjectProfile(root, subpath);
    this.#layoutMarkerSignatures.set(key, markerSignature);
    this.#items.set(key, next);
    return next;
  }
  clear(): void { this.#items.clear(); this.#layoutMarkerSignatures.clear(); }
}
```

Use a private `layoutSignature()` in the implementation: sorted `path:size:mtimeMs` for layout marker paths. If it differs, rebuild even when composer/config fingerprints are unchanged. This is required because a newly added `public/index.php` cannot be detected by hashing composer.json alone.

- [ ] **Step 4: Run profile tests**

```bash
npx vitest run test/profile.test.ts test/detect.test.ts -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/profile.ts test/profile.test.ts fixtures
git commit -m "feat: resolve per-session project profile"
```

---

## Task 6: Routing types and fixed signal dictionary

**Files:**
- Create: `src/routing/types.ts`
- Create: `src/routing/signals.ts`
- Create: `test/routing-signals.test.ts`

- [ ] **Step 1: Write type definitions**

```ts
export const INTENTS = ["Build", "Design", "Review", "Debug", "Test", "Maintain"] as const;
export const CONCERNS = [
  "Architecture", "Design patterns", "Security", "Coding standards", "Testing",
  "Dependencies", "Static analysis", "Debugging",
] as const;
export type Intent = (typeof INTENTS)[number];
export type Concern = (typeof CONCERNS)[number];
export type Target = Intent | Concern;
export type Priority = number;
export type MaintainSubtype = "modernization" | "dependency" | "refactor";
export type Confidence = "high" | "medium" | "low";
export type SkillUnactivatedStatus = "pending" | "awaiting-approval" | "denied";
export type VerificationStatus = "passed" | "failed" | "partial" | "unavailable" | "error";

export interface ClassificationResult {
  intents: Intent[];
  concerns: Concern[];
  scores: Record<Target, number>;
  maintainSubtype: MaintainSubtype | null;
  frameworkContext: string[];
  phpContext: boolean;
  questionForm: boolean;
  reasonCodes: string[];
}

export interface PreviousTask {
  generation: number;
  intents: Intent[];
  concerns: Concern[];
}

export interface UnactivatedSkill {
  id: string;
  attempts: number;
  status: SkillUnactivatedStatus;
  reason: string;
}

export interface SessionRoutingState {
  sessionID: string;
  projectRoot: string;
  projectSubpath: string | null;
  projectFingerprint: string;
  projectLockFingerprint: string | null;
  taskGeneration: number;
  taskStartedAt: number;
  previousTask: PreviousTask | null;
  activeIntents: Intent[];
  activeConcerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  selectedSkills: string[];
  attachedSkills: string[];
  activatedSkills: Set<string>;
  unactivatedSkills: UnactivatedSkill[];
  droppedSkills: Array<{ id: string; reason: string }>;
  mode: "risk" | "strict" | "off";
  lastPromptAt: number;
  lastAnnouncement: string | null;
  verification: {
    lastRunAt: string | null;
    status: VerificationStatus | null;
    failedChecks: string[];
  };
}

export interface StoredSessionRoutingState extends Omit<SessionRoutingState, "activatedSkills"> {
  schemaVersion: 1;
  activatedSkills: string[];
}
```

These state types are the single source of truth. Task 8, Task 10 and Task 11 import them; do not redeclare `SessionRoutingState` later in the plan.

- [ ] **Step 2: Write the exact dictionary test**

```ts
import { describe, expect, it } from "vitest";
import { INTENT_SIGNALS, CONCERN_SIGNALS, FILE_SIGNALS, INTENT_PRIORITY, CONCERN_PRIORITY } from "../src/routing/signals.js";

describe("routing dictionary", () => {
  it("contains all specified intent and concern targets", () => {
    expect(new Set(INTENT_SIGNALS.map(s => s.target))).toEqual(
      new Set(["Build", "Design", "Review", "Debug", "Test", "Maintain"]),
    );
    expect(new Set(CONCERN_SIGNALS.map(s => s.target))).toEqual(
      new Set([
        "Architecture", "Design patterns", "Security", "Coding standards",
        "Testing", "Dependencies", "Static analysis", "Debugging",
      ]),
    );
  });

  it("keeps exact priority orders", () => {
    expect(INTENT_PRIORITY).toEqual(["Debug", "Review", "Test", "Maintain", "Design", "Build"]);
    expect(CONCERN_PRIORITY).toEqual([
      "Security", "Testing", "Debugging", "Static analysis", "Architecture",
      "Design patterns", "Coding standards", "Dependencies",
    ]);
  });

  it("contains mandatory high-weight signals", () => {
    const terms = new Set([...INTENT_SIGNALS, ...CONCERN_SIGNALS].flatMap(s => s.terms));
    for (const term of [
      "implement", "architecture", "security", "phpunit", "upgrade", "sql injection",
      "phpstan", "xdebug", "coding standard",
    ]) expect(terms.has(term)).toBe(true);
  });
});
```

- [ ] **Step 3: Transcribe the spec dictionary literally**

Create `SignalEntry`:

```ts
export interface SignalEntry {
  id: string;
  target: Target;
  weight: 1 | 2 | 3;
  terms: readonly string[];
}
```

Transcribe the complete dictionary from spec §7.2. Do not normalize spellings away. Preserve multi-word phrases exactly:

- Build strong: `add`, `implement`, `create`, `build`, `extend`, `support`, `introduce`, `integrate`, `generate`, `scaffold`.
- Build medium: `new feature`, `feature request`, `endpoint`, `handler`, `service`, `module`, `command`, `job`, `listener`, `controller`.
- Build weak: `change`, `update`, `modify`, `adjust`, `allow`.
- Design, Review, Debug, Test and Maintain lists exactly as in the spec.

Concern lists:

- Architecture, Design patterns, Security, Coding standards, Testing, Dependencies, Static analysis, Debugging exactly as in the spec.

Use stable IDs such as `intent:build:add`, `concern:security:sql-injection`; the content of the ID is not parsed, only uniqueness and diagnostics matter.

`FILE_SIGNALS` must contain:

```ts
export interface FileSignal {
  glob: string;
  target: Target | "*";
  points: 1 | 2;
}
export const FILE_SIGNALS: readonly FileSignal[] = [
  { glob: "*.php", target: "*", points: 1 },
  // tests/, test/, spec/, *Test.php, phpunit.xml*, Pest.php, phpstan.neon*,
  // psalm.xml, .php-cs-fixer.php, phpcs.xml*, rector.php, deptrac.yaml,
  // src/Domain/, Domain/, migrations/
];
```

Do not put file signal weights directly into `SIGNAL_ENTRIES`; classifier applies them separately.

- [ ] **Step 4: Run dictionary tests**

```bash
npx vitest run test/routing-signals.test.ts -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routing/types.ts src/routing/signals.ts test/routing-signals.test.ts
git commit -m "feat: add fixed routing signal dictionary"
```

---

## Task 7: Deterministic classifier

**Files:**
- Create: `src/routing/classifier.ts`
- Create: `test/router-classifier.test.ts`

- [ ] **Step 1: Write failing classifier tests**

```ts
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
    const result = classify({ prompt: "Refactor the payment module to use the Strategy pattern.", ...base });
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
});
```

- [ ] **Step 2: Implement normalization and code-fence stripping**

`classifier.ts` exports this public entry point:

```ts
import type { ProjectProfile } from "../profile.js";
import type { ClassificationResult, MaintainSubtype, SessionRoutingState, Target } from "./types.js";

export interface ClassifierInput {
  prompt: string;
  files: readonly string[];
  agent: string | null;
  profile: ProjectProfile | null;
  state: SessionRoutingState | null;
  /** Phase 1 only uses "off" to disable concern gating. */
  architectureMode?: "risk" | "strict" | "off";
}

export function classify(input: ClassifierInput): ClassificationResult {
  // implementation below
}
```

```ts
export function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function stripCodeFences(prompt: string): string {
  return prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/[ \t]*\r?\n[ \t]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

Keep raw prompt untouched for file-path detection. Remove explicit `@skill-id` tokens before scoring:

```ts
const withoutExplicit = stripCodeFences(normalizePrompt(prompt))
  .replace(/@[a-z0-9-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
```

- [ ] **Step 3: Implement boundary matching**

```ts
const WORD = /[\p{L}\p{N}_]/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function termToRegex(term: string): RegExp {
  const isPrefix = term.endsWith("*");
  const body = escapeRegExp(isPrefix ? term.slice(0, -1) : term);
  return new RegExp(`(?<!${WORD.source})${body}${isPrefix ? "[\\p{L}\\p{N}_]*" : ""}(?!${WORD.source})`, "giu");
}
```

For each entry, find matches in the working string; collect `[start, end)` ranges. Sort entries by maximum term length descending so longer phrases consume first. Replace consumed ranges with spaces of equal length. Each signal ID contributes at most once. Cap every target score at 6.

- [ ] **Step 4: Implement PHP context and framework detection**

```ts
// Framework names are deliberately excluded: framework terms set
// frameworkContext but do not satisfy PHP context on their own.
const PHP_TERMS = [
  "php", "composer", "phpunit", "pest", "phpstan", "psalm",
  "php-cs-fixer", "psr",
];
const FRAMEWORK_TERMS = [
  "laravel", "symfony", "wordpress", "drupal", "magento",
  "cakephp", "yii", "slim", "laminas", "mezzio",
];
function hasPhpTerm(text: string): boolean {
  return PHP_TERMS.some(t => termToRegex(t).test(text));
}
function attachedPhpFile(files: readonly string[]): boolean {
  return files.some(f => /(?:^|\/)(?:composer\.json|[^/]+\.php)$/i.test(f));
}
const PHP_AGENTS = new Set(["php-reviewer", "php-debugger", "php-modernizer", "php-tester", "php-architect"]);

const phpContext = hasPhpTerm(withoutExplicit) || attachedPhpFile(files) || (agent !== null && PHP_AGENTS.has(agent));
const frameworkContext = FRAMEWORK_TERMS.filter(t => termToRegex(t).test(withoutExplicit));
```

PHP context is true only when one of those applies. Framework terms alone set `frameworkContext` and do **not** satisfy context; if no generic PHP signal exists, routing returns empty and the diagnostic list includes `framework:<name>` for each hint. This resolves the spec's overlapping wording in favor of the negative-signal rule: `laravel`, `symfony` and `wordpress` are framework hints, not generic PHP context. Corpus R44 still has PHP context because its default case attaches `src/Example.php`. An active PHP specialist agent is an explicit user choice and satisfies PHP context even when the prompt names another language; there is no separate non-PHP language veto.

- [ ] **Step 5: Implement file and agent signals**

Use `files` paths, not prompt text alone:

- `.php` or `composer.json`: PHP context +1, not a routable target.
- `/(^|\/)(tests?|spec)\//` or `*Test.php`: Testing +2.
- `phpunit.xml*`, `Pest.php`: Testing +2.
- `phpstan.neon*`, `psalm.xml`: Static analysis +2.
- `.php-cs-fixer.php`, `phpcs.xml*`: Standards +2.
- `rector.php`: Maintain +2.
- `deptrac.yaml`: Architecture +2.
- `src/Domain/` or `Domain/`: Architecture +1.
- `migrations/`: Architecture +1.

Profile support points apply only when PHP context is already true, and each category counts once:

- `profile.tools.phpunit` or `profile.tools.pest` → Testing +1.
- `profile.tools.phpstan` or `profile.tools.psalm` → Static analysis +1.
- `profile.tools.csFixer` or `profile.tools.phpcs` → Coding standards +1.
- `profile.tools.deptrac` → Architecture +1.

Agent signals from spec §7.2:

```ts
const AGENT_SIGNALS: Record<string, Partial<Record<Target, number>>> = {
  "php-reviewer": { Review: 3, Security: 2, "Coding standards": 2 },
  "php-debugger": { Debug: 3, Testing: 2, Debugging: 2 },
  "php-modernizer": { Maintain: 3, Dependencies: 2, Testing: 2 },
  "php-tester": { Test: 3, Testing: 3, "Coding standards": 1 },
  "php-architect": { Design: 3, Architecture: 3, "Design patterns": 2, Testing: 1 },
};
```

Active agent comes from session, not prompt text. If agent is absent, no signal.

- [ ] **Step 6: Implement gating, conflicts and truncation**

Question form is detected on the normalized, fence-stripped prompt:

```ts
const QUESTION_FORM = /\b(what is|what are|how does|how do|why|compare|explain)\b/;
// A question is only a knowledge question when it contains no actionable
// build/design/debug/test/maintain verb. Keep this list aligned with the
// intent dictionaries: nouns such as "architecture" or "pattern" do not count.
const ACTION_VERB =
  /\b(add|implement|create|build|extend|support|introduce|integrate|generate|scaffold|design|architect|restructure|decouple|modularize|extract|split|abstract|review|audit|inspect|assess|critique|fix|debug|reproduce|test|upgrade|migrate|refactor|modernize|deprecate|clean up|cleanup|simplify|reorganize|consolidate|rename|remove|update)\b/;
const questionForm = QUESTION_FORM.test(withoutExplicit) && !ACTION_VERB.test(withoutExplicit);
```

Negative signals are exact phrases matched with `termToRegex` and applied once each:

```ts
const NEGATIVE_SIGNALS: ReadonlyArray<{
  terms: readonly string[];
  effects: Partial<Record<Target, number>>;
}> = [
  { terms: ["just fix", "quick fix", "small fix", "typo", "rename variable", "one-line", "minor change"],
    effects: { Architecture: -3, "Design patterns": -3, Design: -1 } },
  { terms: ["no tests", "don't add tests", "skip tests"],
    effects: { Testing: -3, Test: -2 } },
  { terms: ["no refactor", "don't refactor"],
    effects: { Maintain: -3, Architecture: -2 } },
];
```

Apply each matching group's effects after file/agent/profile support points and before gating/conflicts. A negative score never selects a target.

Apply this order exactly:

1. Score dictionary entries.
2. Apply file/agent/profile support points.
3. Apply negative signals.
4. Gate Design patterns and Architecture when a Test/Debug/Review intent would otherwise match, unless `architectureMode` is `"off"`.
5. Apply conflicts before truncation:
   - `Debug` present and `Design < 5` → remove `Design`.
   - `Maintain` present with upgrade signal and `Debug < 5` → remove `Debug`.
   - `Review` present and `Build < 5` → remove `Build`.
6. Sort intents by `score desc`, intent priority, catalog order; take 2.
7. Concerns threshold `>=2`, sort by score desc, concern priority, catalog order; take 3.
8. If Security `>=3` and absent, append or replace lowest non-explicit concern as specified.
9. If no intent reaches 3, attach no intent co-skills; selector handles concerns only.
10. If agent is a known PHP specialist and no intent reaches 3, apply `agentDefaults` defensively.

Concern gating:

- For Test/Debug/Review intents, Design patterns require an explicit pattern/name signal; otherwise zero it and add `gate:non-design-intent` to diagnostics.
- For Test/Debug/Review intents, Architecture requires a weight-3 architecture match or explicit architecture request; otherwise zero it and add the same diagnostic.
- Do not gate when Build, Design or Maintain is selected.

`maintainSubtype`:

Choose the group with highest summed weight; ties resolve `modernization > dependency > refactor`. A Maintain intent without a subtype defaults to `refactor` and never attaches `php-composer` on its own. The groups are fixed:

- `modernization`: `upgrade`, `migrate`, `deprecation`, `rector`, `php 8`, `compatibility`, `legacy`.
- `dependency`: `dependency update`, `composer update`, `package update`, `outdated`, `lock file`.
- `refactor`: `refactor`, `clean up`, `technical debt`, `dead code`, `rename`, `simplify`, `reorganize`, `consolidate`.

`hasUpgradeSignal` is true when any of `upgrade`, `migrate`, `modernize`, `deprecation`, `rector`, `php 8` matched.

- [ ] **Step 7: Return stable diagnostics, not prompt text**

Return:

```ts
{
  intents,
  concerns,
  scores,
  maintainSubtype,
  frameworkContext,
  phpContext,
  questionForm,
  reasonCodes: ["intent:build", "concern:security", "file:tests", "agent:php-tester", "framework:laravel"],
}
```

Never include the user's prompt or raw file contents. Framework hints use `framework:<name>` diagnostics; the state system part also carries a short framework-limit note.

- [ ] **Step 8: Run classifier tests**

```bash
npx vitest run test/router-classifier.test.ts -v
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/routing/classifier.ts test/router-classifier.test.ts
git commit -m "feat: implement deterministic intent classifier"
```

---

## Task 8: Task-boundary state machine

**Files:**
- Create: `src/routing/task-boundary.ts`
- Create: `test/task-boundary.test.ts`

- [ ] **Step 1: Write failing boundary tests**

```ts
import { describe, expect, it } from "vitest";
import { transitionTask } from "../src/routing/task-boundary.js";

const active = {
  taskGeneration: 2,
  taskStartedAt: Date.now() - 60_000,
  activeIntents: ["Build" as const],
  activeConcerns: ["Security" as const],
  maintainSubtype: null,
  previousTask: null,
};

describe("transitionTask", () => {
  it("inherits concerns for an unambiguous continuation", () => {
    const next = transitionTask({
      prompt: "also add tests",
      current: { intents: ["Test"], concerns: ["Testing"], maintainSubtype: null },
      active,
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(false);
    expect(next.taskGeneration).toBe(2);
    expect(next.concerns).toEqual(expect.arrayContaining(["Security", "Testing"]));
  });

  it("does not inherit prior concerns for an unrelated strong-intent task", () => {
    const next = transitionTask({
      prompt: "Add a CSV export feature.",
      current: { intents: ["Build"], concerns: [], maintainSubtype: null },
      active,
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
    expect(next.taskGeneration).toBe(3);
    expect(next.concerns).toEqual([]);
  });

  it("resets explicitly for a switch request", () => {
    const next = transitionTask({
      prompt: "different problem: tidy the README",
      current: { intents: ["Maintain"], concerns: [], maintainSubtype: "refactor" },
      active,
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
    expect(next.previousTask?.intents).toEqual(["Build"]);
  });

  it("treats stale tasks older than 30 minutes as new", () => {
    const next = transitionTask({
      prompt: "summarize the project",
      current: { intents: [], concerns: [], maintainSubtype: null },
      active: { ...active, taskStartedAt: Date.now() - 31 * 60_000 },
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
  });

  it("inherits the Maintain subtype across a continuation", () => {
    const next = transitionTask({
      prompt: "also add tests",
      current: { intents: ["Test"], concerns: ["Testing"], maintainSubtype: null },
      active: {
        ...active,
        activeIntents: ["Maintain"],
        activeConcerns: [],
        maintainSubtype: "modernization",
      },
      files: ["src/Example.php"],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(false);
    expect(next.intents).toContain("Maintain");
    expect(next.maintainSubtype).toBe("modernization");
  });

  it("recomputes the Maintain subtype for a new task", () => {
    const next = transitionTask({
      prompt: "Add a CSV export feature.",
      current: { intents: ["Build"], concerns: [], maintainSubtype: null },
      active: {
        ...active,
        activeIntents: ["Maintain"],
        activeConcerns: [],
        maintainSubtype: "modernization",
      },
      files: [],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(true);
    expect(next.maintainSubtype).toBeNull();
  });

  it("keeps the active intent but recomputes concerns for an ambiguous continuation", () => {
    const next = transitionTask({
      prompt: "also refactor the module",
      current: {
        intents: ["Maintain"],
        concerns: ["Architecture"],
        maintainSubtype: "refactor",
      },
      active: {
        ...active,
        activeIntents: ["Build"],
        activeConcerns: ["Security"],
        maintainSubtype: null,
      },
      files: ["src/Example.php"],
      agent: null,
      now: Date.now(),
    });
    expect(next.reset).toBe(false);
    expect(next.mode).toBe("ambiguous-continuation");
    expect(next.intents).toEqual(["Build"]);
    expect(next.concerns).toEqual(["Architecture"]);
  });
});
```

- [ ] **Step 2: Implement exact transition predicates**

```ts
import type { Concern, Intent, MaintainSubtype, PreviousTask } from "./types.js";

/** The subset of SessionRoutingState the boundary machine reads. */
export interface TaskBoundaryState {
  taskGeneration: number;
  taskStartedAt: number;
  activeIntents: Intent[];
  activeConcerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  previousTask: PreviousTask | null;
}

export interface TaskBoundaryInput {
  prompt: string;
  current: {
    intents: Intent[];
    concerns: Concern[];
    maintainSubtype: MaintainSubtype | null;
  };
  active: TaskBoundaryState | null;
  files: readonly string[];
  agent: string | null;
  now: number;
}

export interface TaskBoundaryResult {
  reset: boolean;
  taskGeneration: number;
  taskStartedAt: number;
  intents: Intent[];
  concerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  previousTask: PreviousTask | null;
  mode: "continuation" | "ambiguous-continuation" | "new-task" | "reset";
}
```

Rules in order:

1. Explicit task-switch phrase (`new task`, `unrelated`, `switch to`, `different problem`) → `reset`.
2. No active state (`active === null` or `active.taskGeneration === 0`), or active task older than 30 minutes with no continuation marker → new task. This is the safety valve and must run before the continuation-marker rule.
3. Continuation marker regex `\b(also|now|then|that|it|this|same|continue|next)\b` or `fix that` or `why`, and either no current strong intent or the prompt names an explicit additional concern (`tests`, `testing`, `security`, `phpstan`, `standards`, `performance`) → continuation.
4. Short prompt (`<= 12` whitespace tokens), no current strong intent, and same project scope (at least one attached file, or an active PHP specialist agent) → continuation.
5. Current strong intent (`intents.length > 0`, because the classifier only emits intents at `>=3`) and no continuation marker → new task.
6. Short prompt with a new concern but no strong intent → ambiguous continuation.
7. Otherwise → ambiguous continuation.

For continuation and ambiguous-continuation results, inherit the active `maintainSubtype` when the current prompt did not produce a new subtype. A new task takes the current prompt's subtype (or `null`). This keeps `Maintain modernization` from falling back to `refactor` on a bare follow-up such as `also add tests`.

`current` is the classifier result. "Strong intent" means `current.intents.length > 0`; the classifier already applied the `>=3` threshold. The state model does not persist prior attached-file names, so Phase 1 treats any attached file as the same-scope proxy; the session root is already the active project, and the boundary input carries only the current file list.

Inheritance:

- Continuation: generation and `taskStartedAt` unchanged; intents = union(active, current); concerns = union(active, current); `previousTask = null` (consumed).
- Ambiguous continuation: generation and `taskStartedAt` unchanged; intents = active intents; concerns = current concerns only; `previousTask = null`.
- New task / explicit switch: generation += 1 (from `0` to `1` when there is no prior active task); `taskStartedAt = now`; `previousTask` = snapshot of the prior active task (`generation`, `activeIntents`, `activeConcerns`), or `null` when there was no prior task; intents and concerns = current only.
- `previousTask` is set only on new/reset and cleared on the next transition; it never contributes skills.
- `lastPromptAt` is recorded by the orchestrator but never used alone to decide inheritance.

- [ ] **Step 3: Run tests**

```bash
npx vitest run test/task-boundary.test.ts -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routing/task-boundary.ts test/task-boundary.test.ts
git commit -m "feat: add task generation boundary state machine"
```

---

## Task 9: Eight-skill catalog and selector

**Files:**
- Create: `src/routing/catalog.ts`
- Create: `src/routing/selector.ts`
- Create: `test/router-selector.test.ts`

- [ ] **Step 1: Write failing selector tests**

```ts
import { describe, expect, it } from "vitest";
import { selectSkills } from "../src/routing/selector.js";

const contentLengths = new Map([
  ["php-architecture", 1000], ["php-testing", 900], ["php-security", 800],
  ["php-standards", 700], ["php-debug", 600], ["php-composer", 600],
  ["php-modernize", 600], ["php-static-analysis", 600],
]);

describe("selectSkills", () => {
  it("attaches php-standards and security for a security review", () => {
    const result = selectSkills({
      prompt: "security review",
      intents: ["Review"], concerns: ["Security"], maintainSubtype: null,
      questionForm: false, explicit: [], activated: new Set(), unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 }, contentLengths,
    });
    expect(result.selected).toEqual(expect.arrayContaining(["php-standards", "php-security"]));
  });

  it("never exceeds the soft budget and records drops", () => {
    const result = selectSkills({
      prompt: "security testing debugging static analysis review",
      intents: ["Review"], concerns: ["Security", "Testing", "Debugging", "Static analysis"],
      maintainSubtype: null, questionForm: false, explicit: [], activated: new Set(), unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 }, contentLengths,
    });
    expect(result.selected.length).toBeLessThanOrEqual(3);
    expect(result.dropped.length).toBeGreaterThan(0);
  });

  it("keeps explicit skills beyond the soft budget but not marked activated", () => {
    const result = selectSkills({
      prompt: "build with explicit skills",
      intents: ["Build"], concerns: ["Security"], maintainSubtype: null,
      questionForm: false,
      explicit: [{ id: "php-security" }, { id: "php-testing" }, { id: "php-standards" }, { id: "php-debug" }],
      activated: new Set(), unactivated: [],
      config: { maxSkills: 1, maxSkillChars: 100 }, contentLengths,
    });
    expect(result.selected).toEqual(expect.arrayContaining(["php-security", "php-testing", "php-standards", "php-debug"]));
    expect(result.selected.length).toBe(4);
  });

  it("suppresses an unactivated skill after two attempts", () => {
    const result = selectSkills({
      prompt: "build with security",
      intents: ["Build"], concerns: ["Security"], maintainSubtype: null,
      questionForm: false, explicit: [], activated: new Set(),
      unactivated: [{ id: "php-security", status: "pending", attempts: 2, reason: "activation:not-confirmed" }],
      config: { maxSkills: 3, maxSkillChars: 12000 }, contentLengths,
    });
    expect(result.selected).not.toContain("php-security");
    expect(result.dropped).toContainEqual({ id: "php-security", reason: "activation:not-confirmed" });
  });

  it("uses the prompt for feature-scale and broad-review terms", () => {
    const feature = selectSkills({
      prompt: "Add an endpoint.",
      intents: ["Build"], concerns: [], maintainSubtype: null,
      questionForm: false, explicit: [], activated: new Set(), unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 }, contentLengths,
    });
    expect(feature.selected).toContain("php-testing");

    const broad = selectSkills({
      prompt: "Review this PR.",
      intents: ["Review"], concerns: [], maintainSubtype: null,
      questionForm: false, explicit: [], activated: new Set(), unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 }, contentLengths,
    });
    expect(broad.selected).toContain("php-security");
  });

  it("uses the fourth slot for a high-confidence security concern", () => {
    const result = selectSkills({
      prompt: "Upgrade to PHP 8.3, fix deprecations, add tests, and fix a security vulnerability.",
      intents: ["Maintain", "Test"], concerns: ["Security", "Testing"],
      maintainSubtype: "modernization", questionForm: false, explicit: [],
      activated: new Set(), unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 }, contentLengths,
      scores: { Security: 6, Testing: 2, Maintain: 6, Test: 3 },
    });
    expect(result.selected).toHaveLength(4);
    expect(result.selected).toContain("php-security");
    expect(result.reasonCodes).toContain("security:hard-ceiling");
  });

  it("does not force a suppressed security concern", () => {
    const result = selectSkills({
      prompt: "Upgrade to PHP 8.3, fix deprecations, add tests, and fix a security vulnerability.",
      intents: ["Maintain", "Test"], concerns: ["Security", "Testing"],
      maintainSubtype: "modernization", questionForm: false, explicit: [],
      activated: new Set(),
      unactivated: [{ id: "php-security", status: "denied", attempts: 1, reason: "permission:denied" }],
      config: { maxSkills: 3, maxSkillChars: 12000 }, contentLengths,
      scores: { Security: 6, Testing: 2, Maintain: 6, Test: 3 },
    });
    expect(result.selected).not.toContain("php-security");
  });

  it("does not count explicit skills against the router budget", () => {
    const result = selectSkills({
      prompt: "Add a new endpoint.",
      intents: ["Build"], concerns: [], maintainSubtype: null,
      questionForm: false,
      explicit: [{ id: "php-standards" }, { id: "php-debug" }, { id: "php-composer" }],
      activated: new Set(), unactivated: [],
      config: { maxSkills: 3, maxSkillChars: 12000 }, contentLengths,
    });
    expect(result.selected).toContain("php-testing");
    expect(result.selected).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Create the eight-skill catalog**

```ts
export const CATALOG = [
  { id: "php-architecture", target: "Architecture", kind: "concern", order: 10 },
  { id: "php-security", target: "Security", kind: "concern", order: 20 },
  { id: "php-testing", target: "Testing", kind: "concern", order: 30 },
  { id: "php-debug", target: "Debugging", kind: "concern", order: 40 },
  { id: "php-static-analysis", target: "Static analysis", kind: "concern", order: 50 },
  { id: "php-standards", target: "Coding standards", kind: "concern", order: 60 },
  { id: "php-composer", target: "Dependencies", kind: "concern", order: 70 },
  { id: "php-modernize", target: "Maintain", kind: "maintain-coskill", order: 80 },
] as const;
```

Do not pretend `php-modernize` is a concern; its `kind` is `maintain-coskill`. Use exact priority order from spec and catalog order for ties.

- [ ] **Step 3: Implement selector ordering**

Use this public contract:

```ts
import type { Concern, Intent, MaintainSubtype, Target, UnactivatedSkill } from "./types.js";

export interface SelectorInput {
  prompt: string;
  intents: Intent[];
  concerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  questionForm: boolean;
  explicit: ReadonlyArray<{ id: string }>;
  activated: ReadonlySet<string>;
  unactivated: readonly UnactivatedSkill[];
  config: { maxSkills: number; maxSkillChars: number };
  contentLengths: ReadonlyMap<string, number>;
  scores?: Partial<Record<Target, number>>;
  agentDefault?: Intent | null;
}

export interface SelectorResult {
  selected: string[];
  attach: Array<{ id: string }>;
  dropped: Array<{ id: string; reason: string }>;
  reasonCodes: string[];
}
```

`prompt` is the raw prompt. Detect feature-scale and broad-review terms on `stripCodeFences(normalizePrompt(prompt)).replace(/@[a-z0-9-]+/g, " ")` using the classifier's `termToRegex`, so selector term matching and classifier term matching cannot drift. Reason codes never include prompt text. When `scores` is omitted, membership in `intents`/`concerns` is the threshold evidence; `scores` only refines ordering and optional co-skill conditions.

Implement this order:

1. Explicit skills.
2. Co-skills:
   - Design → `php-architecture` (Phase 2 will add `php-design-patterns`).
   - Build → `php-testing` when Testing `>=2` or a feature-scale term is present. Feature-scale terms are exactly: `new feature`, `endpoint`, `service`, `module`, `integration`, `multiple`, `providers`, `gateway`, `workflow`. Patterns only when they exist in Phase 2.
   - Review → `php-standards` always; `php-security` when Security `>=2` or broad review. Broad review terms are exactly: `code review`, `pr review`, `pull request review`, `review this pr`, `review the pr`, `audit`.
   - Debug → `php-debug`; `php-testing` when Testing `>=2`.
   - Test → `php-testing`.
   - Maintain `modernization` → `php-modernize`, `php-composer`.
   - Maintain `dependency` → `php-composer`; testing when Testing `>=2`.
   - Maintain `refactor` → `php-architecture`; testing when Testing `>=2`.
3. Concern skills in concern-priority order.
4. High-confidence Security (`>=5`): if `php-security` is still absent, use the fourth slot or replace the lowest-priority non-explicit, non-co-skill selection. Record `security:hard-ceiling`; when a skill is replaced, record `budget:security-replacement`. Explicit skills and intent co-skills outrank the security exception.
5. Agent default only when no intent passed; selector may produce it when caller passes `agentDefault`.
6. Fill the remaining budget by score, only from targets present in `intents` or `concerns` after classifier gating and conflict removal; never promote a below-threshold or conflict-suppressed target just because the budget has room.

Question form suppresses intent co-skills and allows only concern skills scoring `>=2`.

Budget rules:

- `maxSkills` default 3; the router's own count is independent of explicit skills.
- `maxSkillChars` default 12000; the router's own character count is independent of explicit skills; use `contentLengths` measured from file bytes.
- Hard ceiling 4 skills / 16000 chars applies to the total selection and is reached only for explicit overflow or a high-confidence Security concern.
- If adding a candidate exceeds the router's soft cap, drop that candidate and record `budget:max-skills` or `budget:max-chars`.
- Explicit skills are reported in `selected` but never in `attach`; they are already in `event.prompt.skills`.
- Explicit overflow records `budget:explicit-overflow`, never removes explicit skills.
- Activated skills are never attached again.
- Router skills already recorded as `awaiting-approval` or `denied` in `unactivated` are not re-attached; explicit skills remain in the prompt but are recorded as denied/awaiting.
- Unactivated router skills suppress after two attachment attempts in the same task generation.
- Return stable reason codes: `intent:build`, `concern:security`, `coskill:review-standards`, `security:hard-ceiling`, `budget:max-skills`, `budget:security-replacement`, `explicit:@php-testing`.

- [ ] **Step 4: Run selector tests**

```bash
npx vitest run test/router-selector.test.ts -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routing/catalog.ts src/routing/selector.ts test/router-selector.test.ts
git commit -m "feat: select existing PHP skills with deterministic budget"
```

---

## Task 10: Session state, persistence and permission lifecycle

**Files:**
- Create: `src/routing/state.ts`
- Create: `src/routing/persistence.ts`
- Create: `src/routing/permissions.ts`
- Create: `test/session-state.test.ts`
- Create: `test/permissions.test.ts`

- [ ] **Step 1: Write failing state/persistence tests**

```ts
import { describe, expect, it } from "vitest";
import { createSessionState, markActivated, markAttached } from "../src/routing/state.js";
import { hydrateStorageState, serializeStorageState } from "../src/routing/persistence.js";

describe("session routing state", () => {
  it("does not mark selected skills as activated until activation event", () => {
    const state = createSessionState({ sessionID: "s1", projectRoot: "/repo", projectSubpath: null });
    markAttached(state, ["php-testing"], "pending");
    expect(state.activatedSkills.has("php-testing")).toBe(false);
    markActivated(state, "php-testing");
    expect(state.activatedSkills.has("php-testing")).toBe(true);
  });

  it("round-trips without prompt text", () => {
    const state = createSessionState({ sessionID: "s1", projectRoot: "/repo", projectSubpath: null });
    state.activeIntents = ["Build"];
    state.activeConcerns = ["Security"];
    state.maintainSubtype = "modernization";
    const stored = serializeStorageState(state);
    const restored = hydrateStorageState(stored);
    expect(restored?.activeIntents).toEqual(["Build"]);
    expect(restored?.maintainSubtype).toBe("modernization");
    expect(JSON.stringify(stored)).not.toContain("prompt");
  });

  it("hydrates persisted state after a restart", async () => {
    const state = createSessionState({ sessionID: "s1", projectRoot: "/repo", projectSubpath: null });
    state.activeIntents = ["Maintain"];
    state.maintainSubtype = "modernization";
    const stored = serializeStorageState(state);
    const sessions = new Map();
    const storage = { get: async () => stored, set: async () => {} };
    const loaded = await loadOrCreateState(storage, sessions, {
      sessionID: "s1", projectRoot: "/repo", projectSubpath: null,
    });
    expect(loaded).not.toBe(state);
    expect(loaded.activeIntents).toEqual(["Maintain"]);
    expect(loaded.maintainSubtype).toBe("modernization");
  });
});
```

Permission tests:

```ts
import { describe, expect, it } from "vitest";
import { effectiveSkillPermission } from "../src/routing/permissions.js";

const rules = [
  { action: "skill", resource: "php-security", effect: "allow" as const },
  { action: "skill", resource: "php-*", effect: "deny" as const },
];

describe("effectiveSkillPermission", () => {
  it("uses the last matching rule", () => {
    expect(effectiveSkillPermission(rules, "php-testing")).toBe("deny");
  });
  it("returns pending when nothing matches", () => {
    expect(effectiveSkillPermission([], "php-testing")).toBe("pending");
  });
  it("ignores unrelated actions", () => {
    expect(effectiveSkillPermission([{ action: "tool", resource: "*", effect: "deny" }], "php-testing")).toBe("pending");
  });
});
```

- [ ] **Step 2: Implement state model exactly**

Import `SessionRoutingState`, `StoredSessionRoutingState`, `UnactivatedSkill`, `SkillUnactivatedStatus` and the related types from `./types.js`; import `TaskBoundaryResult` from `./task-boundary.js`; import `ProjectProfile` from `../profile.js`. Task 6 is the single source of truth, so do not redeclare the state interfaces here. `activatedSkills` stays a `Set<string>` in memory and becomes `string[]` only in the storage document.

`src/routing/state.ts` exports the factories and mutations used by the orchestrator:

```ts
export interface CreateSessionStateInput {
  sessionID: string;
  projectRoot: string;
  projectSubpath: string | null;
  profile?: ProjectProfile;
  mode?: "risk" | "strict" | "off";
  now?: number;
}

export function createSessionState(input: CreateSessionStateInput): SessionRoutingState {
  const now = input.now ?? Date.now();
  return {
    sessionID: input.sessionID,
    projectRoot: input.projectRoot,
    projectSubpath: input.projectSubpath,
    projectFingerprint: input.profile?.fingerprint ?? "",
    projectLockFingerprint: input.profile?.lockFingerprint ?? null,
    taskGeneration: 0,
    taskStartedAt: now,
    previousTask: null,
    activeIntents: [],
    activeConcerns: [],
    maintainSubtype: null,
    selectedSkills: [],
    attachedSkills: [],
    activatedSkills: new Set(),
    unactivatedSkills: [],
    droppedSkills: [],
    mode: input.mode ?? "risk",
    lastPromptAt: 0,
    lastAnnouncement: null,
    verification: { lastRunAt: null, status: null, failedChecks: [] },
  };
}

export function markAttached(
  state: SessionRoutingState,
  ids: readonly string[],
  status: SkillUnactivatedStatus = "pending",
): void {
  for (const id of ids) {
    if (state.activatedSkills.has(id)) continue;
    if (!state.attachedSkills.includes(id)) state.attachedSkills.push(id);
    const existing = state.unactivatedSkills.find((skill) => skill.id === id);
    if (existing) {
      existing.attempts += 1;
      existing.status = status;
      existing.reason = status === "pending" ? "activation:not-confirmed" : `permission:${status}`;
    } else {
      state.unactivatedSkills.push({
        id,
        attempts: 1,
        status,
        reason: status === "pending" ? "activation:not-confirmed" : `permission:${status}`,
      });
    }
  }
}

export function markActivated(state: SessionRoutingState, id: string): void {
  state.activatedSkills.add(id);
  state.unactivatedSkills = state.unactivatedSkills.filter((skill) => skill.id !== id);
  if (!state.attachedSkills.includes(id)) state.attachedSkills.push(id);
}

export function markDenied(state: SessionRoutingState, id: string, reason = "permission:denied"): void {
  const existing = state.unactivatedSkills.find((skill) => skill.id === id);
  if (existing) {
    existing.status = "denied";
    existing.reason = reason;
  } else {
    state.unactivatedSkills.push({ id, attempts: 1, status: "denied", reason });
  }
}

export function applyTaskBoundary(
  state: SessionRoutingState,
  boundary: TaskBoundaryResult,
  profile: ProjectProfile,
): SessionRoutingState {
  state.taskGeneration = boundary.taskGeneration;
  state.taskStartedAt = boundary.taskStartedAt;
  state.previousTask = boundary.previousTask;
  state.activeIntents = [...boundary.intents];
  state.activeConcerns = [...boundary.concerns];
  state.maintainSubtype = boundary.maintainSubtype;
  state.projectFingerprint = profile.fingerprint;
  state.projectLockFingerprint = profile.lockFingerprint;
  if (boundary.reset) {
    for (const skill of state.unactivatedSkills) {
      if (skill.status === "pending") skill.attempts = 0;
    }
    state.droppedSkills = [];
  }
  return state;
}
```

`markAttached` ignores IDs already activated, adds missing IDs to `attachedSkills`, increments `attempts` for an existing `unactivatedSkills` entry, and records `activation:not-confirmed` for `pending` or `permission:<status>` otherwise. `markActivated` adds to `activatedSkills` and removes the matching `unactivatedSkills` entry. `markDenied` records `permission:denied` and never adds the skill to `attachedSkills`; a router skill is filtered out before attachment, while an explicit denied skill remains in `event.prompt.skills` and is represented by its `denied` entry. `applyTaskBoundary` copies generation, start time, `previousTask`, intents, concerns and `maintainSubtype` from the boundary result and refreshes the project fingerprints. On a new task or reset, it resets `attempts` to `0` for `pending` entries so the two-attempt suppression is scoped to one generation; `denied` and `awaiting-approval` entries survive until a permissions event changes them.

`state.ts` also owns the synchronous render-context map used by Task 11 and Task 12:

```ts
export interface RoutingRenderContext {
  profile: ProjectProfile;
  state: SessionRoutingState;
  boundaryMode?: "continuation" | "ambiguous-continuation" | "new-task" | "reset";
}
export function setRoutingRenderContext(sessionID: string, value: RoutingRenderContext): void;
export function getRoutingRenderContext(sessionID: string): RoutingRenderContext | undefined;
export function clearRoutingRenderContext(sessionID: string): void;
```

`src/routing/persistence.ts` owns the storage key and the load/save pair:

```ts
export const SESSION_STORAGE_PREFIX = "php-toolkit:session:";
export function serializeStorageState(state: SessionRoutingState): StoredSessionRoutingState;
export function hydrateStorageState(raw: unknown): SessionRoutingState | null;

export async function loadOrCreateState(
  storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> },
  sessions: Map<string, SessionRoutingState>,
  input: CreateSessionStateInput,
): Promise<SessionRoutingState>;

export async function persistStorageState(
  storage: { set(key: string, value: unknown): Promise<void> },
  state: SessionRoutingState,
): Promise<void>;
```

`loadOrCreateState` reuses the in-memory entry only when `sessionID`, `projectRoot` and `projectSubpath` match. Otherwise it hydrates `php-toolkit:session:<sessionID>`, validates the same scope, and falls back to `createSessionState`. A storage read failure is logged and treated as a cache miss, so routing still proceeds. It stores the result in the per-plugin `sessions` map. `persistStorageState` writes `serializeStorageState(state)` best-effort; the orchestrator catches its errors. `serializeStorageState()` must omit project paths from metrics, but storage may retain root locally; do not export. `hydrateStorageState()` validates `schemaVersion`, arrays, enum values and the optional `maintainSubtype`; corrupt documents return `null` and are ignored. A missing `maintainSubtype` hydrates as `null`, so pre-existing schema-v1 documents remain readable.

Storage key:

```text
php-toolkit:session:<sessionID>
```

- [ ] **Step 3: Implement permission interpretation**

```ts
export type EffectivePermission = "pending" | "awaiting-approval" | "denied";
export function effectiveSkillPermission(rules: readonly { action: string; resource: string; effect: string }[], skillID: string): EffectivePermission {
  const matches = rules.filter(r => r.action === "skill" && globMatches(r.resource, skillID));
  if (matches.length === 0) return "pending";
  const effect = matches[matches.length - 1].effect;
  if (effect === "deny") return "denied";
  if (effect === "ask") return "awaiting-approval";
  return "pending";
}
function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(value);
}
```

If the ruleset is absent or has no skill rules, return `pending`. Never infer denial from absence of activation.

`permissions.ts` also exports the selector post-filter used by the orchestrator:

```ts
export interface PermissionedAttachment {
  id: string;
  status: SkillUnactivatedStatus;
}
export interface FilteredSelection extends Omit<SelectorResult, "attach"> {
  attach: PermissionedAttachment[];
  deniedRouter: PermissionedAttachment[];
  explicitStatuses: PermissionedAttachment[];
}

export function filterByPermission(
  selection: SelectorResult,
  rules: readonly { action: string; resource: string; effect: string }[],
  explicitIDs: ReadonlySet<string>,
): FilteredSelection;
```

Rules:

- Explicit IDs are always retained in `selected`; their effective permission is returned in `explicitStatuses` and never used to remove a user-selected skill.
- Router IDs with `denied` are removed from `attach`, recorded in `dropped` as `permission:denied`, and returned in `deniedRouter` so the orchestrator can persist their `denied` state.
- Router IDs with `awaiting-approval` are attached once and recorded as `permission:awaiting-approval`. The selector already excludes IDs whose existing `unactivatedSkills` entry is `awaiting-approval` or `denied`, so `filterByPermission` only classifies fresh attachments and never needs the full state.
- Router IDs with `pending` remain attachable under the selector's two-attempt rule.
- `reasonCodes` are preserved and extended with the permission reason.

Permissions update logic:

- `denied` → `pending` when no matching deny remains.
- `awaiting-approval` → `pending` on effective allow; `denied` on deny.
- Clear `activation:not-confirmed` suppressions when a relevant permission changes.
- Do not attach from the permissions event.
- Activation remains the only proof of loading.

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/session-state.test.ts test/permissions.test.ts -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routing/state.ts src/routing/persistence.ts src/routing/permissions.ts test/session-state.test.ts test/permissions.test.ts
git commit -m "feat: track selected and activated skills separately"
```

---

## Task 11: Routing orchestrator and prompt hook

**Files:**
- Create: `src/routing/orchestrator.ts`
- Modify: `src/index.ts`
- Create: `test/orchestrator.test.ts`

- [ ] **Step 1: Write failing failure-isolation tests**

```ts
import { describe, expect, it } from "vitest";
import { runRoutingSafely } from "../src/routing/orchestrator.js";

describe("runRoutingSafely", () => {
  it("returns no attachments when routing throws", async () => {
    const result = await runRoutingSafely(async () => { throw new Error("boom"); });
    expect(result.attach).toEqual([]);
    expect(result.error).toBe("boom");
  });

  it("never removes user-selected skills when router fails", async () => {
    const result = await runRoutingSafely(
      async () => { throw new Error("boom"); },
      [{ id: "php-testing" }],
    );
    expect(result.explicit).toEqual([{ id: "php-testing" }]);
  });
});
```

- [ ] **Step 2: Implement orchestrator pipeline**

```ts
import type { Plugin } from "@opencode/plugin";
import type { ToolkitConfig } from "../config.js";
import type { MetricsRegistry } from "../metrics/registry.js";
import type { ProjectProfile, ProjectProfileCache } from "../profile.js";
import { classify } from "./classifier.js";
import { filterByPermission } from "./permissions.js";
import { loadOrCreateState, persistStorageState } from "./persistence.js";
import { selectSkills } from "./selector.js";
import { applyTaskBoundary, markAttached, markDenied, setRoutingRenderContext } from "./state.js";
import { transitionTask } from "./task-boundary.js";
import type { ClassificationResult, SessionRoutingState } from "./types.js";

export interface RoutePromptInput {
  sessionID: string;
  text: string;
  files: string[];
  skills: Array<{ id: string; mention?: { start: number; end: number; text: string } }>;
}
export interface RoutePromptResult {
  explicit: RoutePromptInput["skills"];
  attach: Array<{ id: string }>;
  profile: ProjectProfile;
  state: SessionRoutingState;
  reasons: string[];
}
export interface SafeRoutingResult {
  explicit: RoutePromptInput["skills"];
  attach: Array<{ id: string }>;
  error?: string;
}

export async function runRoutingSafely(
  run: () => Promise<RoutePromptResult>,
  explicit: RoutePromptInput["skills"] = [],
): Promise<SafeRoutingResult> {
  try {
    const result = await run();
    return { explicit: result.explicit, attach: result.attach };
  } catch (err) {
    return { explicit, attach: [], error: (err as Error).message };
  }
}

export async function runRouting(
  ctx: Plugin.Context,
  input: RoutePromptInput,
  config: ToolkitConfig,
  profileCache: ProjectProfileCache,
  sessions: Map<string, SessionRoutingState>,
  contentLengths: ReadonlyMap<string, number>,
  metrics: MetricsRegistry,
): Promise<RoutePromptResult> {
  const session = await ctx.session.get({ sessionID: input.sessionID });
  const root = session?.location?.directory ?? ctx.location.directory;
  const subpath = session?.subpath ?? null;
  const profile = await profileCache.resolve(root, subpath);
  const state = await loadOrCreateState(ctx.storage, sessions, {
    sessionID: input.sessionID,
    projectRoot: root,
    projectSubpath: subpath,
    profile,
    mode: config.architectureMode,
  });
  const current = classify({
    prompt: input.text,
    files: input.files,
    agent: session?.agent ?? null,
    profile,
    state,
    architectureMode: config.architectureMode,
  });
  // Non-PHP prompts skip routing entirely. Keep the active task untouched so
  // an unrelated prompt cannot advance the generation or inherit PHP concerns.
  if (!current.phpContext) {
    return {
      explicit: input.skills,
      attach: [],
      profile,
      state,
      reasons: current.reasonCodes,
    };
  }
  const boundary = transitionTask({
    prompt: input.text,
    current,
    active: state,
    files: input.files,
    agent: session?.agent ?? null,
    now: Date.now(),
  });
  const withTask = applyTaskBoundary(state, boundary, profile);
  const selection = selectSkills({
    prompt: input.text,
    intents: withTask.activeIntents,
    concerns: withTask.activeConcerns,
    maintainSubtype: withTask.maintainSubtype,
    questionForm: current.questionForm,
    explicit: input.skills,
    activated: withTask.activatedSkills,
    unactivated: withTask.unactivatedSkills,
    config: { maxSkills: config.maxSkills, maxSkillChars: config.maxSkillChars },
    contentLengths,
    scores: current.scores,
    agentDefault: null,
  });
  const explicitIDs = new Set(input.skills.map((skill) => skill.id));
  const permissioned = filterByPermission(selection, session?.permissions ?? [], explicitIDs);
  if (!session?.location?.directory) permissioned.reasonCodes.push("profile:root-fallback");
  const attach = config.autoSkills === "attach" ? permissioned.attach : [];
  if (config.autoSkills !== "attach") permissioned.reasonCodes.push(`config:auto-skills-${config.autoSkills}`);
  for (const item of permissioned.explicitStatuses) {
    if (item.status === "denied") markDenied(withTask, item.id);
    else markAttached(withTask, [item.id], item.status);
  }
  for (const item of permissioned.deniedRouter) markDenied(withTask, item.id);
  for (const item of attach) markAttached(withTask, [item.id], item.status);
  withTask.selectedSkills = config.autoSkills === "off" ? [] : permissioned.selected;
  withTask.droppedSkills = config.autoSkills === "off" ? [] : permissioned.dropped;
  withTask.lastPromptAt = Date.now();
  setRoutingRenderContext(input.sessionID, { profile, state: withTask, boundaryMode: boundary.mode });
  try {
    await persistStorageState(ctx.storage, withTask);
  } catch (err) {
    console.error(`[php-toolkit] routing persistence failed: ${(err as Error).message}`);
  }
  try {
    await recordRoutingMetrics(metrics, current, boundary, {
      ...permissioned,
      selected: config.autoSkills === "off" ? [] : permissioned.selected,
      dropped: config.autoSkills === "off" ? [] : permissioned.dropped,
      attach,
    });
  } catch (err) {
    console.error(`[php-toolkit] routing metrics failed: ${(err as Error).message}`);
  }
  return {
    explicit: input.skills,
    attach: attach.map(({ id }) => ({ id })),
    profile,
    state: withTask,
    reasons: permissioned.reasonCodes,
  };
}

async function recordRoutingMetrics(
  metrics: MetricsRegistry,
  current: ClassificationResult,
  boundary: ReturnType<typeof transitionTask>,
  selection: ReturnType<typeof filterByPermission>,
): Promise<void> {
  if (current.intents.length) await metrics.recordRouting({ kind: "intents", values: current.intents });
  if (current.concerns.length) await metrics.recordRouting({ kind: "concerns", values: current.concerns });
  for (const id of selection.selected) await metrics.recordRouting({ kind: "selected", skill: id });
  for (const item of selection.attach) {
    if (item.status === "pending") await metrics.recordRouting({ kind: "unactivated", skill: item.id });
  }
  for (const drop of selection.dropped) await metrics.recordRouting({ kind: "dropped", reason: drop.reason });
  if (boundary.reset) {
    await metrics.recordRouting({ kind: "task-generation" });
    await metrics.recordRouting({ kind: "reset" });
  } else if (boundary.mode === "continuation" || boundary.mode === "ambiguous-continuation") {
    await metrics.recordRouting({ kind: "continuation" });
  }
}
```

`contentLengths` is built once in `setup` from the registered skill markdown: `new Map(skills.map(s => [s.id, Buffer.byteLength(s.content, "utf8")]))`. The `fallbackDiagnostic` (`profile:root-fallback`) is appended to `permissioned.reasonCodes` when `session.location.directory` is absent; do not drop it.

Requirements:

- Explicit skills are merged, never replaced; `event.prompt.skills = [...explicit, ...newAttachments]`.
- `autoSkills: "hint"` records `selectedSkills` but attaches nothing; `autoSkills: "off"` records no selection and attaches nothing. L0 and task state remain active in both modes.
- The router never removes `@skill-id` attachments.
- New attachments are pushed as `{ id }`, not with mention offsets.
- A denied router skill is recorded but not pushed.
- An ask-effective router skill is pushed once and marked `awaiting-approval`.
- An already-awaiting skill is not pushed again until permissions change.
- If classification or profile resolution fails, log, attach nothing and continue; prompt admission must not throw.
- If `session.location.directory` is absent, append `profile:root-fallback` to `reasons`.
- `ctx.storage` writes are best-effort and exclude prompt text.
- Metrics are recorded only after routing succeeds; a routing failure records no routing metrics and attaches nothing.
- Metrics writes are best-effort; a metrics failure is logged and never discards the routing decision or attachments.
- Do not announce by default.

- [ ] **Step 3: Wire prompt hook in `src/index.ts`**

In `src/index.ts`, import `readToolkitConfig` from `./config.js`. In `setup`, parse the plugin options once, declare the per-plugin session map and the skill content lengths before the prompt hook. Populate `contentLengths` while the existing skill registration loop loads each `SKILL.md`:

```ts
const config = readToolkitConfig(ctx.options);
const profileCache = new ProjectProfileCache();
const sessions = new Map<string, SessionRoutingState>();
const contentLengths = new Map<string, number>();
// inside the skill loop, after parseFrontmatter:
contentLengths.set(id, Buffer.byteLength(content, "utf8"));
```

Import `ProjectProfileCache` from `./profile.js` alongside `readToolkitConfig`.

Replace the existing prompt hook with:

```ts
track(await ctx.session.hook("prompt", async (event) => {
  const explicit = event.prompt.skills ?? [];
  const result = await runRoutingSafely(
    () => runRouting(ctx, {
      sessionID: event.sessionID,
      text: event.prompt.text,
      files: (event.prompt.files ?? []).map(f => f.name ?? f.uri ?? ""),
      skills: explicit,
    }, config, profileCache, sessions, contentLengths, metrics),
    explicit,
  );
  if (result.error) console.error(`[php-toolkit] routing failed: ${result.error}`);
  // Router attachments are plain IDs; the host brand is only a type-level marker.
  event.prompt.skills = [...explicit, ...result.attach] as typeof event.prompt.skills;
  if (PHP_TRIGGER.test(event.prompt.text)) {
    try {
      await metrics.active.recordTrigger();
    } catch (err) {
      console.error(`[php-toolkit] trigger metrics failed: ${(err as Error).message}`);
    }
  }
}));
```

Use actual attached-file URI conversion as `{ uri, name }` retains both; when mapping to classifier, prefer `name`, fall back to `uri`. Do not pass file contents into classifier.

- [ ] **Step 4: Run tests**

```bash
npx vitest run test/orchestrator.test.ts -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routing/orchestrator.ts src/index.ts test/orchestrator.test.ts
git commit -m "feat: wire deterministic routing into prompt hook"
```

---

## Task 12: Context hook, L0 part and state part

**Files:**
- Create: `src/context/parts.ts`
- Modify: `src/index.ts`
- Create: `test/context-parts.test.ts`

- [ ] **Step 1: Write failing context part tests**

```ts
import { describe, expect, it } from "vitest";
import { removePhpToolkitParts, renderToolkitStatePart } from "../src/context/parts.js";

describe("context parts", () => {
  it("removes prior php-toolkit system parts only", () => {
    const input = [
      { type: "text", text: "keep me" },
      { type: "text", text: "old", metadata: { "php-toolkit": { kind: "state" } } },
    ];
    expect(removePhpToolkitParts(input as never)).toEqual([{ type: "text", text: "keep me" }]);
  });

  it("renders a compact state block without prompt text", () => {
    const text = renderToolkitStatePart({
      profile: { type: "application", phpRequirement: "^8.2", frameworkHints: ["none"] } as never,
      state: { taskGeneration: 2, activeIntents: ["Build"], activeConcerns: ["Security"], selectedSkills: ["php-security"], attachedSkills: ["php-security"], activatedSkills: new Set(), unactivatedSkills: [{ id: "php-security", status: "pending", attempts: 1, reason: "pending" }] } as never,
    });
    expect(text).toContain("Task: generation 2");
    expect(text).toContain("pending: php-security");
    expect(text).not.toContain("prompt");
  });
});
```

- [ ] **Step 2: Implement parts**

```ts
import type { ProjectProfile } from "../profile.js";
import { L0_CONSTITUTION } from "../constitution.js";
import type { RoutingRenderContext } from "../routing/state.js";

// Structurally matches the SessionContext.system entries from @opencode/plugin.
type SystemPart = { type: "text"; text: string; metadata?: Record<string, unknown> };
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function renderToolkitStatePart(context: RoutingRenderContext): string {
  const { profile, state } = context;
  const lines = ["PHP toolkit context"];
  const framework = profile.frameworkHints.filter((hint) => hint !== "none");
  const php = profile.phpRequirement ? `PHP ${profile.phpRequirement}` : "PHP version unknown";
  lines.push(
    `Project: ${php} ${profile.type}; ${framework.length ? framework.join(" + ") : "no framework"}.`,
  );
  if (framework.length) {
    lines.push(
      `Framework: ${framework.join(" + ")} — generic PHP routing; framework-specific rules live in the sibling toolkit.`,
    );
  }
  const mode = context.boundaryMode ? ` (${context.boundaryMode})` : "";
  lines.push(
    `Task: generation ${state.taskGeneration}${mode} | intents: ${state.activeIntents.join(", ") || "none"} | concerns: ${state.activeConcerns.join(", ") || "none"}`,
  );
  const selected = state.selectedSkills.length ? state.selectedSkills.join(", ") : "none";
  const attached = state.attachedSkills.length ? state.attachedSkills.join(", ") : "none";
  const activated = state.activatedSkills.size ? [...state.activatedSkills].join(", ") : "none";
  const pending = state.unactivatedSkills
    .filter((skill) => skill.status === "pending")
    .map((skill) => skill.id);
  const pendingText = pending.length ? pending.join(", ") : "none";
  lines.push(`Skills: selected=${selected}; attached=${attached}; activated=${activated}; pending: ${pendingText}`);
  return lines.join("\n");
}
export const PHP_TOOLKIT_PART = "php-toolkit";
export function removePhpToolkitParts(system: SystemPart[]): SystemPart[] {
  return system.filter(part => !(isRecord(part) && isRecord(part.metadata) && part.metadata[PHP_TOOLKIT_PART]));
}
export function l0Part(): SystemPart {
  return { type: "text", text: L0_CONSTITUTION, metadata: { "php-toolkit": { kind: "l0" } } } as SystemPart;
}
export function statePart(text: string): SystemPart {
  return { type: "text", text, metadata: { "php-toolkit": { kind: "state" } } } as SystemPart;
}
```

State text template:

```text
PHP toolkit context
Project: PHP 8.2 application; PSR-4 Acme\; PHPUnit + PHPStan; no framework.
Task: generation 3 (continuation) | intents: Build | concerns: Security, Testing
Skills: selected=php-security, php-testing; activated=php-testing; pending: php-security
```

Elide irrelevant lines. Never include prompt text, file contents, absolute paths in model-facing state.

- [ ] **Step 3: Replace context hook**

```ts
import { getRoutingRenderContext } from "../routing/state.js";
import { l0Part, removePhpToolkitParts, renderToolkitStatePart, statePart } from "./context/parts.js";

track(await ctx.session.hook("context", (event) => {
  event.system = removePhpToolkitParts(event.system);
  event.system.push(l0Part());
  const render = getRoutingRenderContext(event.sessionID);
  if (render && render.state.taskGeneration > 0) {
    try {
      event.system.push(statePart(renderToolkitStatePart(render)));
    } catch (err) {
      console.error(`[php-toolkit] context render failed: ${(err as Error).message}`);
    }
  }
}));
```

`SessionContext` exposes `sessionID` at the top level in `@opencode/plugin@2.0.26`; use `event.sessionID` directly. `getRoutingRenderContext()` is a synchronous in-memory lookup from `src/routing/state.ts`, populated by the prompt hook and permission/activation handlers; it must not call `ctx.session.get()` or `ctx.storage`. Hydration from storage happens in the prompt hook when a routing decision is needed. If no context exists, render L0 only. If state rendering throws, remove the broken state part and push only L0; never let the context hook throw into the model request.

The state part is re-created from memory/storage on every primary agent-loop request; no duplication. Tool continuations are included because this hook runs for them.

- [ ] **Step 4: Add no-op hooks**

Register:

```ts
track(await ctx.session.hook("compaction", () => {}));
track(await ctx.session.hook("title", () => {}));
track(await ctx.session.hook("generate", () => {}));
```

They must not inject task state or rewrite results.

- [ ] **Step 5: Run context tests**

```bash
npx vitest run test/context-parts.test.ts -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/context/parts.ts src/index.ts test/context-parts.test.ts
git commit -m "feat: render L0 and compact routing state parts"
```

---

## Task 13: `/php-toolkit-status`

**Files:**
- Create: `src/status/toolkit-status.ts`
- Create: `commands/php-toolkit-status.md`
- Modify: `src/content.ts`
- Modify: `src/index.ts`
- Create: `test/toolkit-status.test.ts`

- [ ] **Step 1: Write failing status renderer test**

```ts
import { describe, expect, it } from "vitest";
import { renderToolkitStatus } from "../src/status/toolkit-status.js";

describe("renderToolkitStatus", () => {
  it("shows profile, confidence, task generation, selection, reasons and verification marker", () => {
    const text = renderToolkitStatus({
      profile: { root: "/repo/app", subpath: null, type: "application", typeConfidence: "high", phpRequirement: "^8.2", frameworkHints: ["none"], tools: { phpunit: true } as never } as never,
      state: { taskGeneration: 3, activeIntents: ["Build"], activeConcerns: ["Testing"], selectedSkills: ["php-testing"], attachedSkills: ["php-testing"], activatedSkills: new Set(["php-testing"]), unactivatedSkills: [], droppedSkills: [{ id: "php-security", reason: "budget:max-skills" }], lastPromptAt: 0, verification: { lastRunAt: null, status: null, failedChecks: [] } } as never,
      config: { autoSkills: "attach", architectureMode: "risk", architectureScan: "tool", announceSelections: "off" } as never,
    });
    expect(text).toContain("Project: /repo/app (application, high confidence");
    expect(text).toContain("Task: generation 3");
    expect(text).toContain("Selected: php-testing");
    expect(text).toContain("Dropped: php-security (budget:max-skills)");
  });
});
```

- [ ] **Step 2: Implement renderer**

```text
PHP toolkit status
  Project: /repo/app (application, high confidence, PHP ^8.2, PHPUnit + PHPStan)
  Root: /repo/app (subpath: none)
  Task: generation 3
  Active: build | concerns: testing
  Selected: php-testing
  Attached: php-testing
  Activated: php-testing
  Pending: none
  Dropped: php-security (budget:max-skills)
  Reasons: intent:build, concern:testing, budget:max-skills
  Mode: risk | scan: tool | announce: off
  Verify: unavailable (Phase 3)
```

`Root` is local diagnostic output and may contain absolute path; do not use the renderer for metrics export. If the session cannot be resolved, render `Project: unavailable (session has no location)` instead of falling back silently. Derive the `Reasons:` line from the state: `intent:<slug>` for each `activeIntents` entry, then `concern:<slug>` for each `activeConcerns` entry, then every distinct `droppedSkills[].reason`, in that order, where `slug` is the target lowercased with spaces replaced by hyphens (for example `Coding standards` becomes `coding-standards`). Never add prompt text.

The renderer contract is:

```ts
export interface ToolkitStatusInput {
  profile: ProjectProfile | null;
  state: SessionRoutingState | null;
  config: ToolkitConfig;
}
export function renderToolkitStatus(input: ToolkitStatusInput): string;
```

`buildCurrentStatusSnapshot` is exported from `src/status/toolkit-status.ts` with this shape:

```ts
export async function buildCurrentStatusSnapshot(
  ctx: Plugin.Context,
  input: {
    sessionID: string;
    profileCache: ProjectProfileCache;
    sessions: Map<string, SessionRoutingState>;
    config: ToolkitConfig;
  },
): Promise<string>;
```

It resolves the session root exactly like `runRouting`, loads or creates state, and calls `renderToolkitStatus`. It never invents a profile when the session has no location.

- [ ] **Step 3: Add command markdown**

```markdown
---
description: Show PHP toolkit profile, routing and diagnostics
---

The user asked for the PHP toolkit status. Render the following snapshot verbatim as a compact report. Do not add advice, do not change configuration, and do not invent missing values. If the snapshot says a value is unavailable, report it as unavailable.

SNAPSHOT_PLACEHOLDER
```

Replace `SNAPSHOT_PLACEHOLDER` in the command executor with `renderToolkitStatus(...)` output, then call `ctx.session.prompt`.

- [ ] **Step 4: Register command**

Add `{ file: "commands/php-toolkit-status.md", name: "php-toolkit-status", fallback: "Show PHP toolkit routing diagnostics" }` to `COMMAND_DEFS` or special-case it in `src/index.ts`; use the special case so the live snapshot is executed at command time, not embedded as static markdown.

```ts
if (c.name === "php-toolkit-status") {
  const snapshot = await buildCurrentStatusSnapshot(ctx, {
    sessionID,
    profileCache,
    sessions,
    config,
  });
  await ctx.session.prompt({ sessionID, text: c.template.replace("SNAPSHOT_PLACEHOLDER", snapshot), delivery });
  return;
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run test/toolkit-status.test.ts -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/status/toolkit-status.ts commands/php-toolkit-status.md src/content.ts src/index.ts test/toolkit-status.test.ts
git commit -m "feat: add php-toolkit-status diagnostics"
```

---

## Task 14: Skill activation and permissions subscriptions

**Files:**
- Create: `src/routing/events.ts`
- Modify: `src/index.ts`
- Create: `test/permission-events.test.ts`

- [ ] **Step 1: Write failing event re-evaluation tests**

```ts
import { describe, expect, it } from "vitest";
import { applyPermissionsEvent, applySkillActivatedEvent } from "../src/routing/events.js";
import { createSessionState } from "../src/routing/state.js";

const baseState = (sessionID: string) =>
  createSessionState({ sessionID, projectRoot: "/repo", projectSubpath: null });

describe("routing events", () => {
  it("marks only the matching session and skill activated", () => {
    const state = baseState("s1");
    applySkillActivatedEvent(state, { sessionID: "s1", id: "php-testing" });
    applySkillActivatedEvent(state, { sessionID: "s2", id: "php-security" });
    expect(state.activatedSkills.has("php-testing")).toBe(true);
    expect(state.activatedSkills.has("php-security")).toBe(false);
  });

  it("moves denied to pending when permission changes to allow", () => {
    const state = baseState("s1");
    state.unactivatedSkills.push({ id: "php-security", attempts: 1, status: "denied", reason: "permission:denied" });
    applyPermissionsEvent(state, [{ action: "skill", resource: "php-security", effect: "allow" }]);
    expect(state.unactivatedSkills[0].status).toBe("pending");
  });

  it("does not infer denial from missing activation", () => {
    const state = baseState("s1");
    state.unactivatedSkills.push({ id: "php-security", attempts: 1, status: "pending", reason: "pending" });
    applyPermissionsEvent(state, []);
    expect(state.unactivatedSkills[0].status).toBe("pending");
  });
});
```

- [ ] **Step 2: Implement subscription pump**

`src/routing/events.ts` exports `applySkillActivatedEvent(state, event)` and `applyPermissionsEvent(state, rules)`. The former ignores events whose `sessionID` does not match `state.sessionID`; the latter re-evaluates every `unactivatedSkills` entry and never attaches. The pump uses the `sessions` map created in Task 11 and imports `markActivated`, `persistStorageState` and the event functions. Wrap each `persistStorageState` call in the pump in its own `try/catch`: a storage failure is logged and must not stop the subscription.

In `setup`, before returning cleanup:

```ts
const eventsAbort = new AbortController();
void (async () => {
  try {
    const stream = await ctx.event.subscribe({ signal: eventsAbort.signal });
    for await (const event of stream) {
      if (eventsAbort.signal.aborted) break;
      if (event.type === "session.skill.activated") {
        const state = sessions.get(event.data.sessionID);
        if (state) {
          markActivated(state, event.data.id);
          try {
            await metrics.recordRouting({ kind: "activated", skill: event.data.id });
          } catch (err) {
            console.error(`[php-toolkit] routing metrics failed: ${(err as Error).message}`);
          }
          try {
            await persistStorageState(ctx.storage, state);
          } catch (err) {
            console.error(`[php-toolkit] routing persistence failed: ${(err as Error).message}`);
          }
        }
      } else if (event.type === "session.permissions") {
        const state = sessions.get(event.data.sessionID);
        if (state) {
          applyPermissionsEvent(state, event.data.permissions);
          try {
            await persistStorageState(ctx.storage, state);
          } catch (err) {
            console.error(`[php-toolkit] routing persistence failed: ${(err as Error).message}`);
          }
        }
      }
    }
  } catch (err) {
    if (!eventsAbort.signal.aborted) console.error(`[php-toolkit] session event subscription failed: ${(err as Error).message}`);
  }
})();
```

Cleanup aborts with `eventsAbort.abort()`. If the runtime supports an explicit subscription dispose object, use it; otherwise abort the pump.

Fallback when event subscription fails:

- Attached skills remain unactivated.
- Next prompt may re-attach pending skills under the two-attempt rule.
- Do not count missing activation as failure.

- [ ] **Step 3: Run event tests**

```bash
npx vitest run test/permission-events.test.ts -v
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routing/events.ts src/index.ts test/permission-events.test.ts
git commit -m "feat: reconcile activation and permissions events"
```

---

## Task 15: Phase 1 routing corpus

**Files:**
- Create: `test/fixtures/routing-corpus.json`
- Create: `test/routing-corpus.test.ts`

- [ ] **Step 1: Create the Phase 1-capable corpus**

Copy every spec corpus case R01–R49. Phase 1-enabled cases assert their expected set; pattern-dependent cases are included with `"enabledInPhase": 2` and `"reason": "pattern-library-not-shipped"`, but are not asserted in Phase 1.

```json
[
  { "id": "R01", "prompt": "Add a new payment gateway.", "expected": ["php-design-patterns", "php-testing"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R02", "prompt": "Add multiple payment providers with proper test coverage and security.", "expected": ["php-testing", "php-design-patterns", "php-security"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R03", "prompt": "Fix the slow query in the user payment feature.", "expected": ["php-debug"], "enabledInPhase": 1 },
  { "id": "R04", "prompt": "Review this PR for security issues.", "expected": ["php-standards", "php-security"], "enabledInPhase": 1 },
  { "id": "R05", "prompt": "Review the diff for PSR-12 violations.", "expected": ["php-standards"], "enabledInPhase": 1 },
  { "id": "R06", "prompt": "Review this PR.", "expected": ["php-standards", "php-security"], "enabledInPhase": 1 },
  { "id": "R07", "prompt": "Review the diff.", "expected": ["php-standards"], "enabledInPhase": 1 },
  { "id": "R08", "prompt": "Upgrade to PHP 8.3 and fix deprecations.", "expected": ["php-modernize", "php-composer"], "enabledInPhase": 1 },
  { "id": "R09", "prompt": "Upgrade to PHP 8.3, fix deprecations, and add tests.", "expected": ["php-modernize", "php-composer", "php-testing"], "enabledInPhase": 1 },
  { "id": "R10", "prompt": "Refactor the payment module to use the Strategy pattern.", "expected": ["php-architecture", "php-pattern-strategy"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R11", "prompt": "Add a decorator around the payment gateway.", "expected": ["php-pattern-decorator", "php-testing"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R12", "prompt": "Write a test for the payment gateway.", "expected": ["php-testing"], "enabledInPhase": 1 },
  { "id": "R13", "prompt": "What is the difference between Strategy and Adapter?", "expected": ["php-design-patterns"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R14", "prompt": "Explain the Strategy pattern.", "expected": ["php-pattern-strategy"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R15", "prompt": "Can you fix this?", "expected": ["php-debug"], "enabledInPhase": 1 },
  { "id": "R16", "prompt": "Add an email validation method to this class.", "expected": [], "enabledInPhase": 1 },
  { "id": "R17", "prompt": "Make the checkout flow secure.", "expected": ["php-security"], "enabledInPhase": 1 },
  { "id": "R18", "prompt": "Add authentication to the admin panel.", "expected": ["php-security"], "enabledInPhase": 1 },
  { "id": "R19", "prompt": "Add a repository for the Order aggregate.", "expected": ["php-design-patterns", "php-architecture"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R20", "prompt": "Introduce an extension point for export formats.", "expected": ["php-architecture", "php-design-patterns"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R21", "prompt": "Decouple the domain from the infrastructure.", "expected": ["php-architecture", "php-design-patterns"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R22", "prompt": "Fix the security vulnerability in the login form.", "expected": ["php-debug", "php-security"], "enabledInPhase": 1 },
  { "id": "R23", "prompt": "Run PHPStan and fix the type errors.", "expected": ["php-debug", "php-static-analysis"], "enabledInPhase": 1 },
  { "id": "R24", "prompt": "This class has too many responsibilities; split it.", "expected": ["php-architecture"], "enabledInPhase": 1 },
  { "id": "R25", "prompt": "Add a new endpoint.", "expected": ["php-testing"], "enabledInPhase": 1 },
  { "id": "R26", "prompt": "Add an endpoint with PHPStan level 9.", "expected": ["php-testing", "php-static-analysis"], "enabledInPhase": 1 },
  { "id": "R27", "prompt": "Add a cache layer with Redis.", "expected": ["php-architecture"], "enabledInPhase": 1 },
  { "id": "R28", "prompt": "Add a cache to the report generator.", "expected": [], "enabledInPhase": 1 },
  { "id": "R29", "prompt": "The invoice test is flaky and fails intermittently.", "expected": ["php-debug", "php-testing"], "enabledInPhase": 1 },
  { "id": "R30", "prompt": "Add tests for the invoice calculator.", "expected": ["php-testing"], "enabledInPhase": 1 },
  { "id": "R31", "prompt": "Migrate the legacy billing module to a new namespace.", "expected": ["php-modernize", "php-composer", "php-architecture"], "enabledInPhase": 1 },
  { "id": "R32", "prompt": "Add a data provider for the invoice tests.", "expected": ["php-testing"], "enabledInPhase": 1 },
  { "id": "R33", "prompt": "Add a Stripe integration service.", "expected": ["php-design-patterns", "php-testing"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R34", "prompt": "Add a factory for creating invoices.", "expected": ["php-design-patterns"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R35", "prompt": "Refactor the switch statement into a state machine.", "expected": ["php-architecture", "php-pattern-state"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R36", "prompt": "Add an adapter for the legacy payment API.", "expected": ["php-pattern-adapter"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R37", "prompt": "Modernize the legacy billing code.", "expected": ["php-modernize", "php-composer"], "enabledInPhase": 1 },
  { "id": "R38", "prompt": "Add a singleton for the database connection.", "expected": ["php-design-patterns"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R39", "prompt": "Refactor this 500-line controller.", "expected": ["php-architecture"], "enabledInPhase": 1 },
  { "id": "R40", "prompt": "Add a new feature flag service.", "expected": ["php-testing"], "enabledInPhase": 1 },
  { "id": "R41", "prompt": "Add CSRF protection to the signup form.", "expected": ["php-security"], "enabledInPhase": 1 },
  { "id": "R42", "prompt": "Add an interface for the payment gateway.", "expected": ["php-testing", "php-design-patterns"], "enabledInPhase": 2, "reason": "pattern-library-not-shipped" },
  { "id": "R43", "prompt": "Refactor this TypeScript component.", "expected": [], "enabledInPhase": 1, "noPhpContext": true },
  { "id": "R44", "prompt": "Add a Laravel controller with tests and security.", "expected": ["php-testing", "php-security"], "enabledInPhase": 1 },
  { "id": "R45", "prompt": "Fix this.", "expected": [], "enabledInPhase": 1, "noPhpContext": true },
  { "id": "R46", "prompt": "Add a method to the class.", "expected": ["php-testing"], "agent": "php-tester", "enabledInPhase": 1 },
  { "id": "R47", "prompt": "Review this PR for security issues.", "expected": ["php-standards", "php-security"], "agent": "php-reviewer", "enabledInPhase": 1 },
  { "id": "R48", "prompt": "Fix the slow query.", "expected": ["php-debug", "php-testing"], "agent": "php-debugger", "enabledInPhase": 1 },
  { "id": "R49", "prompt": "Add a new service.", "expected": ["php-architecture", "php-design-patterns", "php-testing"], "agent": "php-architect", "enabledInPhase": 2, "reason": "pattern-library-not-shipped" }
]
```

The corpus contains every spec case R01–R49. Phase 1 asserts the enabled subset: R03–R09, R12, R15–R18, R22–R32, R37, R39–R41, R43–R48. Pattern-dependent cases R01, R02, R10, R11, R13, R14, R19–R21, R33–R36, R38, R42 and R49 are `enabledInPhase: 2` with `reason: pattern-library-not-shipped`; they are never asserted in Phase 1. R44 remains Phase 1 because its expected skills are the generic `php-testing` and `php-security`; its default attached file supplies PHP context.

- [ ] **Step 2: Write corpus runner**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../src/routing/classifier.js";
import { selectSkills } from "../src/routing/selector.js";

const contentLengths = new Map([
  ["php-architecture", 1000], ["php-testing", 900], ["php-security", 800],
  ["php-standards", 700], ["php-debug", 600], ["php-composer", 600],
  ["php-modernize", 600], ["php-static-analysis", 600],
]);

const cases = JSON.parse(readFileSync(new URL("./fixtures/routing-corpus.json", import.meta.url), "utf8"));

function selectForCorpus(c: any): string[] {
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
    const ids = new Set(cases.map((c: any) => c.id));
    for (let i = 1; i <= 49; i += 1) {
      expect(ids.has(`R${String(i).padStart(2, "0")}`)).toBe(true);
    }
  });

  it("gives every Phase 2 case a reason", () => {
    for (const c of cases.filter((x: any) => x.enabledInPhase > 1)) {
      expect(c.reason).toBe("pattern-library-not-shipped");
    }
  });

  for (const c of cases.filter((x: any) => x.enabledInPhase <= 1)) {
    it(c.id, () => {
      expect(new Set(selectForCorpus(c))).toEqual(new Set(c.expected));
    });
  }
});
```

Corpus schema: `prompt`, `expected`, `enabledInPhase`, optional `reason`, `files`, `noPhpContext` and `agent`. Attached-file context defaults to `["src/Example.php"]` unless the case has `"files": [...]` or `"noPhpContext": true`. `enabledInPhase: 2` cases must include a `reason`. Cases R46–R48 must set `agent` (`php-tester`, `php-reviewer`, `php-debugger`); R43 and R45 must set `noPhpContext: true`.

- [ ] **Step 3: Run corpus**

```bash
npx vitest run test/routing-corpus.test.ts -v
```

Expected: PASS for Phase 1 cases; skipped/excluded cases are listed with reasons, never silently expected.

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/routing-corpus.json test/routing-corpus.test.ts
git commit -m "test: add phase 1 routing corpus"
```

---

## Task 16: Integration tests and plugin smoke test

**Files:**
- Create: `test/plugin-integration.test.ts`
- Modify: `test/metrics-registry.test.ts` if routing metrics were added to registry

- [ ] **Step 1: Write fake-plugin integration tests**

Use a fake `ctx` object, not a live OpenCode process:

```ts
export function fakePluginContext(overrides: {
  agent?: string | null;
  permissions?: Array<{ action: string; resource: string; effect: string }>;
  options?: Record<string, unknown>;
  roots?: Record<string, string>;
  events?: Array<{ type: string; data: any }>;
} = {}) {
  const skills = new Set<unknown>();
  const promptHooks: Array<(event: any) => Promise<void> | void> = [];
  const contextHooks: Array<(event: any) => Promise<void> | void> = [];
  const compactionHooks: Array<(event: any) => Promise<void> | void> = [];
  const defaultRoot = resolve("fixtures/php-app");
  let releaseEvents = (): void => {};
  const eventGate = new Promise<void>((resolve) => { releaseEvents = resolve; });
  return {
    location: { directory: overrides.roots?.s1 ?? defaultRoot },
    options: overrides.options ?? { autoSkills: "attach" },
    session: {
      get: async (input: { sessionID: string }) => {
        const directory = overrides.roots?.[input.sessionID] ?? defaultRoot;
        return {
          id: input.sessionID,
          location: { directory },
          subpath: undefined,
          agent: overrides.agent === undefined ? "php-tester" : overrides.agent,
          permissions: overrides.permissions ?? [],
        };
      },
      hook: async (name: string, cb: any) => {
        if (name === "prompt") promptHooks.push(cb);
        if (name === "context") contextHooks.push(cb);
        if (name === "compaction") compactionHooks.push(cb);
        return { dispose: async () => {} };
      },
      prompt: async () => {},
    },
    command: { transform: async (cb: any) => { cb({ add() {} }); return { dispose: async () => {} }; } },
    tool: { transform: async (cb: any) => { cb({ namespace() {}, add() {} }); return { dispose: async () => {} }; }, hook: async () => ({ dispose: async () => {} }) },
    skill: { transform: async (cb: any) => { cb({ get: () => undefined, add(skill: unknown) { skills.add(skill); } }); return { dispose: async () => {} }; } },
    storage: { get: async () => undefined, set: async () => {}, remove: async () => {}, scan: async () => ({ entries: [] }) },
    event: {
      subscribe: async function* () {
        if (!overrides.events) return;
        await eventGate;
        for (const event of overrides.events) yield event;
      },
    },
    releaseEvents: () => releaseEvents(),
    triggerPromptHook: async (event: any) => { for (const cb of promptHooks) await cb(event); },
    triggerContextHook: async (event: any) => { for (const cb of contextHooks) await cb(event); },
    triggerCompactionHook: async (event: any) => { for (const cb of compactionHooks) await cb(event); },
  };
}
```

Use `fakePluginContext({ agent: null })` for the non-PHP case, `fakePluginContext({ permissions: [...] })` for denied/ask cases, and `fakePluginContext({ options: { autoSkills: "hint" } })` / `"off"` for the escape-hatch cases. Unit tests may call `applySkillActivatedEvent`/`applyPermissionsEvent` directly, but at least one integration test must drive the real subscription pump: pass `events`, trigger the prompt, call `releaseEvents()`, and wait for the state part to reflect activation.

Test cases:

- Build prompt with PHP file attaches `php-testing` when Testing >=2.
- Non-PHP prompt attaches nothing.
- `autoSkills: "hint"` records selected skills but attaches nothing.
- `autoSkills: "off"` attaches nothing and leaves L0 active.
- Explicit `@php-testing` is preserved when router selects another skill.
- Denied router skill is recorded and not attached.
- Ask skill is attached once; second prompt does not re-attach while awaiting.
- Activation event marks loaded; attached-but-denied does not.
- The event subscription pump applies a `session.skill.activated` event end to end.
- A denied explicit skill stays in `event.prompt.skills` and is recorded as denied.
- A storage write failure is logged and does not drop attachments.
- Context hook removes old parts, pushes L0 and at most one state part.
- Two sessions in different roots get different profiles (pass `roots` to `fakePluginContext`).
- Compaction hook does not mutate summary.

- [ ] **Step 2: Run integration tests**

```bash
npx vitest run test/plugin-integration.test.ts -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/plugin-integration.test.ts test/metrics-registry.test.ts
git commit -m "test: cover plugin routing integration paths"
```

---

## Task 17: Documentation, version bump and dist sync

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Build: `dist/**`

- [ ] **Step 1: Bump version without creating a tag**

```bash
npm version 0.2.0 --no-git-tag-version
```

Expected: `package.json` and `package-lock.json` contain `0.2.0`.

- [ ] **Step 2: Update README**

Add a section titled `Reactive routing (0.2.0)` documenting:

- Default behavior: deterministic, silent, risk-based.
- Skills attach automatically only with PHP context.
- Eight existing skills are preserved; no pattern skills yet.
- Configuration table:

```jsonc
{
  "plugins": [{
    "package": "opencode-php-toolkit",
    "options": {
      "autoSkills": "attach",
      "maxSkills": 3,
      "maxSkillChars": 12000,
      "architectureMode": "risk",
      "announceSelections": "off"
    }
  }]
}
```

Escape hatches:

- `autoSkills: "hint"` records recommendations without attaching.
- `autoSkills: "off"` restores passive behavior; L0 remains.
- `architectureMode: "off"` disables design gating.
- `announceSelections` remains `off` by default.
- No synthetic messages are used to announce routing.

Document `/php-toolkit-status` output and state semantics: selected ≠ attached ≠ activated.

- [ ] **Step 3: Update CHANGELOG**

```markdown
## 0.2.0 - 2026-11-04

- Add deterministic intent × concern routing for the eight existing PHP skills.
- Add per-session project profiles with application/library confidence and root+subpath isolation.
- Add L0 engineering constitution and remove the static one-line hint.
- Add task-generation boundaries so unrelated tasks do not inherit prior concerns.
- Add selected/attached/activated skill state and permission-aware attachment.
- Add `/php-toolkit-status`, metrics v3 routing counters and best-effort session persistence.
- Add `autoSkills: "hint" | "off"` escape hatches; default remains `attach` and silent.
```

- [ ] **Step 4: Build and verify dist**

```bash
npm run build
git add -A -- dist
git diff --cached --stat -- dist
```

Inspect the diff before committing. If the build produces unrelated churn, stop and fix the build configuration.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json README.md CHANGELOG.md dist
git commit -m "docs: prepare 0.2.0 reactive routing release"
```

---

## Task 18: Full verification and acceptance checklist

**Files:**
- Modify: none unless failures are found
- Verify: entire repository

- [ ] **Step 1: Install clean dependencies**

```bash
rm -rf node_modules
npm ci --no-audit --no-fund
```

Expected: exits 0.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: exits 0 with no TypeScript errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass, including pre-existing suites.

- [ ] **Step 4: Build and check plugin import**

```bash
npm run build
node -e "import('./dist/index.js').then(m => { if (m.default.id !== 'php-toolkit') throw new Error(m.default.id); console.log('plugin id:', m.default.id) })"
```

Expected: `plugin id: php-toolkit`.

- [ ] **Step 5: Check dist committed and package contents**

```bash
git diff --exit-code -- dist
npm pack --dry-run
```

Expected: no dist diff; package contains `dist`, `agents`, `commands`, `skills`, `README.md`, `LICENSE`, `CHANGELOG.md` and `postinstall.mjs`.

- [ ] **Step 6: Run the Phase 1 acceptance checklist manually**

Check each item and record evidence in the PR description:

- [ ] Review prompt attaches review-relevant skills.
- [ ] Build prompt attaches build-relevant skills.
- [ ] Non-PHP prompt attaches nothing.
- [ ] Explicit `@skill-id` remains attached and is never router-dropped.
- [ ] Router-selected denied skill is recorded and not attached.
- [ ] Explicit denied skill remains in the prompt and is recorded as denied.
- [ ] Ask skill attaches once and is not re-attached while awaiting approval.
- [ ] Permission change clears/re-evaluates denied and awaiting-approval states.
- [ ] New unrelated strong-intent task does not inherit prior concerns.
- [ ] A continuation inherits the active Maintain subtype instead of falling back to `refactor`.
- [ ] A high-confidence Security concern uses the hard ceiling instead of being dropped by the soft budget.
- [ ] `architectureMode: "off"` disables classifier design gating without disabling routing.
- [ ] Attached skill is not marked activated until `session.skill.activated`.
- [ ] Compaction hook does not inject or rewrite routing state.
- [ ] `ctx.storage` failure does not break prompt admission.
- [ ] Two sessions in different roots get different profiles.
- [ ] `/php-toolkit-status` shows profile, type confidence, task generation, selection and reasons.
- [ ] No prompt text, code or file contents are written to storage/metrics.
- [ ] README and CHANGELOG document the behavior change and escape hatches.

- [ ] **Step 7: Final commit**

```bash
git status --short
git add -A
git commit -m "feat: phase 1 reactive routing foundation"
```

Expected: commit succeeds; working tree clean except intentional release metadata.

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
| --- | --- |
| §5 application vs library classification | Tasks 4–5 |
| §5 per-session root/subpath resolution | Tasks 5, 11 |
| §5 cache and lock fingerprint | Task 5 |
| §6 L0 constitution | Tasks 2, 12 |
| §7.2 signal dictionary and matching | Tasks 6–7 |
| §7.3 thresholds/conflicts/maintain subtype | Task 7 |
| §7.4 task generations and reset | Task 8 |
| §7.5 budget selection and explicit protection | Task 9 |
| §7.6 permissions lifecycle | Tasks 10, 14 |
| §7.7 prompt/context/compaction hooks | Tasks 11, 12, 14 |
| §7.8 state model | Tasks 10, 12 |
| §12 `/php-toolkit-status` | Task 13 |
| §13 config and escape hatches | Task 3 |
| §14 metrics v3 | Tasks 1, 14, 17 |
| §15 corpus tests | Task 15 |
| §16 Phase 1 acceptance criteria | Tasks 15–18 |
| §17 migration notes and versioning | Task 17 |
| §19 assumptions 10/12 documented verified; remaining Phase 1 gates tested | Tasks 1, 5, 11, 12 |

### Placeholder scan

- No `TBD`, `TODO`, `implement later` or generic “add error handling” steps.
- All paths are explicit.
- Unknown runtime shapes are validated against `node_modules/@opencode/plugin@2.0.26` types before use; no speculative instructions API is used.
- Pattern-dependent corpus cases are explicitly marked `enabledInPhase: 2`, never silently skipped.
- Phase 1 does not create or register pattern skills.

### Type consistency

- `Intent` and `Concern` literals match the spec.
- `SessionRoutingState` is declared once in Task 6; Task 8 consumes the narrower `TaskBoundaryState` and Task 10 imports the shared state types.
- `SessionRoutingState.activatedSkills` is `Set<string>` in memory and `string[]` in storage.
- `verification.status` is limited to `passed | failed | partial | unavailable | error | null`; Phase 1 does not produce verification results.
- `EffectivePermission` values are recorded as `pending | awaiting-approval | denied`, matching metrics and state serialization.
- `ProjectProfileCache.resolve()` is the only profile entry point used by the orchestrator.

### Known trade-offs accepted in Phase 1

- The full spec corpus passes in Phase 2, not Phase 1, because pattern skills do not exist yet.
- `php-toolkit.json` architecture boundaries are not parsed in Phase 1; they belong to Phase 5.
- The context state part is re-rendered on every context request; this is intentional for correctness and cache-stable L0 separation.
- Permissions snapshot shape is interpreted conservatively; unknown shapes remain `pending`.

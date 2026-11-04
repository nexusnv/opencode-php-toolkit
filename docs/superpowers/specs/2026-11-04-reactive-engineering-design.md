# PHP Toolkit — Reactive Engineering Guidance Design

> Date: 2026-11-04
> Status: Proposed
> Scope: Major enhancement to `opencode-php-toolkit`; framework-agnostic PHP 8.1+.
> Relationship to prior spec: replaces the passive skill-catalog behavior described in
> `2026-10-13-php-toolkit-design.md`. Existing skill IDs, commands, tools and agents
> remain compatible.

## 1. Summary

The toolkit currently registers eight skills and advertises them to the model. That is a
catalog, not guidance: the model decides whether to call `skill`, and in practice the
toolkit stays passive until the user explicitly invokes it.

This design turns the toolkit into a **reactive engineering guidance system** with three
layers:

1. **Knowledge** — skills, pattern references and project-specific context.
2. **Guidance** — a deterministic router that attaches the right knowledge to the current
   task, plus a small always-on engineering constitution.
3. **Verification** — a read-only `php_verify` workflow that checks the result instead of
   trusting that good instructions produced good code.

The user should describe what they want to build. The toolkit should help OpenCode make
sound engineering decisions without requiring the user to understand the engineering
disciplines behind those decisions — and without turning everyday work into an approval
ceremony.

## 2. Problem and goals

### Current state

- Eight skills are registered and advertised; the model may or may not load them.
- The prompt hook only tags PHP mentions; the context hook injects one static hint.
- There is no project profile, no routing, no architecture workflow and no verification.
- Coverage is weighted toward review, debugging and refactoring. Building new software gets
  little proactive design guidance.
- The toolkit has no way to tell whether its advice was followed.

### Prior art

A worktree prototype (dangling merge commit `054d22d`) added `php-patterns`,
`php-pattern-strategy`, `php-pattern-repository` and `php-pattern-decorator`, registered
hidden via `disable-model-invocation` and backed by `references/`. It proved that hidden
skills can be attached by ID without appearing in the model's advertised list. This design
generalizes that prototype into a two-dimensional router and a problem-first library.

The latest improvement branch also adds `php_composer_outdated`, `php_static_analysis`,
`php_test` and a richer `php_project_detect` (analyzer/fixer config files, `platform.php`).
The verification layer composes these tools; it does not reimplement their parsing.

### Goals

- Make the existing skills reactive: attach relevant skills automatically, with a budget.
- Add project awareness, including the application-vs-library distinction.
- Add a problem-first PHP design-pattern library with progressive disclosure.
- Add risk-based architecture behavior that does not gate small changes.
- Add a verification layer that runs the checks the project actually has.
- Keep context cost bounded and predictable.
- Preserve existing skill IDs, commands, tools and agents.
- Remain framework-agnostic; Laravel/Symfony specifics stay in sibling toolkits.

### Non-goals

- Framework-specific rules (Laravel, Symfony, WordPress, etc.).
- Automatic code refactoring or automatic architecture rewrites.
- Replacing PHPStan, Psalm, PHPUnit, Pest or PHP_CodeSniffer.
- LLM-based intent classification in the first release.
- Mandatory ADRs or mandatory approval for every design decision.
- Installing dependencies or modifying project configuration to make checks pass.
- Scanning or routing for non-PHP projects.

## 3. Design principles

1. **Teach thinking, not snippets.** Prefer "assess whether behavior varies independently"
   over "use Strategy."
2. **Precision over recall.** Missing an optional skill is less harmful than loading
   irrelevant instructions.
3. **Explicit user intent wins.** `@skill-id` and explicit requests always take precedence
   over automatic routing.
4. **Least friction by default.** Small changes are implemented, not gated. Strict design
   review is opt-in.
5. **Progressive disclosure.** L0 constitution → L1 task skills → L2 pattern references →
   L3 deep material. Nothing loads before it is needed.
6. **Advisory, not authoritarian.** The scanner reports findings and hypotheses; it does
   not declare architecture violations without configured boundaries.
7. **Verify, don't claim.** A feature is not complete because code was written; it is
   complete when the available checks pass or the gaps are stated.
8. **Preserve compatibility.** No existing ID, command, tool or agent is removed.

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenCode v2 plugin                          │
│                                                                     │
│  setup(ctx)                                                         │
│    ├─ load skills + routing catalog                                 │
│    ├─ build/refresh ProjectProfile (cached)                          │
│    ├─ register tools: php_* (existing + verify + architecture scan) │
│    ├─ register commands and agents                                  │
│    └─ register hooks                                                │
│                                                                     │
│  session.hook("prompt")                                             │
│    profile → classify → select → merge explicit → subtract loaded   │
│    → event.prompt.skills.push(...) → update SessionState → metrics  │
│                                                                     │
│  session.hook("context")                                            │
│    push L0 constitution (stable)                                    │
│    ensure model-facing state entry exists and is current            │
│                                                                     │
│  session.instructions.entry                                         │
│    php-toolkit.profile   — compact project profile                  │
│    php-toolkit.mode      — active intents/concerns + behavior mode  │
│    php-toolkit.skills    — selected/loaded skills + reason codes    │
│    php-toolkit.verify    — completion checklist / last verify state │
│                                                                     │
│  tools                                                              │
│    php_project_detect (existing)                                    │
│    php_lint (existing)                                              │
│    php_composer_audit (existing)                                    │
│    php_composer_outdated (existing)                                 │
│    php_static_analysis (existing)                                   │
│    php_test (existing)                                              │
│    php_metrics (existing, extended)                                 │
│    php_verify (new)                                                 │
│    php_architecture_scan (new, phase 5)                             │
│                                                                     │
│  commands / agents                                                  │
│    existing 7 commands + /php-design, /php-architect,               │
│    /php-toolkit-status                                              │
│    existing 4 agents + php-architect                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Component responsibilities

| Component | Responsibility |
| --- | --- |
| `ProjectProfile` | Read-only project discovery, cached and fingerprinted. |
| `Classifier` | Deterministic intent × concern scoring from prompt, files, agent, profile and session state. |
| `Selector` | Map classification to skills, enforce budget, respect explicit selections and permissions. |
| `SessionState` | Track active task, selected/loaded skills, announcements and verification state. |
| `SkillCatalog` | Routing metadata for every skill; markdown remains the content source of truth. |
| `PromptRouter` | Attach selected skills via `event.prompt.skills`; never rewrite the user's prompt. |
| `ContextState` | Inject the L0 constitution and keep model-facing state current. |
| `Verifier` | Run available project checks and produce a pass/fail/skipped report. |
| `ArchitectureScanner` | Read-only token-based structure analysis, advisory only. |
| `Metrics` | Local, privacy-safe counters for routing, verification and scanning. |

### Data flow

1. Plugin setup loads skill markdown, routing metadata and the project profile.
2. On a user prompt, the prompt hook classifies the task and selects skills.
3. Selected skills are merged with explicit `@skill-id` selections and attached through
   `event.prompt.skills`.
4. Session state is updated and a compact model-facing entry is written if the selection
   changed.
5. The context hook pushes the stable L0 constitution on every model request and ensures
   the state entry is present.
6. For build/design tasks, the state entry includes the verification reminder.
7. The model may call `php_verify` and `php_architecture_scan`; the toolkit never runs them
   automatically in the default configuration.
8. Metrics are recorded locally; no prompt text or code is stored.

## 5. Project Profile

Project awareness is foundational. The router must not treat a Composer package, a legacy
application and a framework app as the same environment.

### Profile fields

```ts
interface ProjectProfile {
  root: string;
  type: "application" | "library" | "unknown";
  phpRequirement: string | null;       // composer.json require.php
  hasComposerJson: boolean;
  hasComposerLock: boolean;
  autoloadPsr4: Record<string, string>;
  packageName: string | null;
  packageType: string | null;          // composer.json type
  frameworkHints: Array<"laravel" | "symfony" | "wordpress" | "none">;
  tools: {
    phpunit: boolean;
    pest: boolean;
    phpstan: boolean;
    psalm: boolean;
    phpcs: boolean;
    csFixer: boolean;
    rector: boolean;
    deptrac: boolean;
    infection: boolean;
  };
  configFiles: {
    phpunit: string | null;
    pest: string | null;
    phpstan: string | null;
    psalm: string | null;
    phpcs: string | null;
    csFixer: string | null;
    deptrac: string | null;
    architecture: string | null;       // php-toolkit.json
  };
  layout: {
    sourceRoots: string[];             // from PSR-4
    testRoots: string[];               // tests/, test/, spec/
    hasPublicIndex: boolean;
    hasConsoleBin: boolean;
    hasMigrations: boolean;
  };
  fingerprint: string;                 // hash of composer.json + config files
}
```

### Application vs library

Use explicit signals, not Composer usage alone:

| Signal | Application | Library |
| --- | --- | --- |
| `composer.json` `type` | `project` | `library` |
| Entry points | `public/index.php`, `bin/console` | `src/` public API, no app entry point |
| Layout | `config/`, `migrations/`, `templates/`, `public/` | `src/` + `tests/`, maybe `bin/` tooling |
| Dependencies | runtime services are expected | minimize dependency surface |
| Tests | behavior + integration | public contracts + edge cases |
| Release | deploy | semver + BC |

If signals conflict or the type is unknown, use neutral guidance. Ask one focused question
only when the answer materially changes an architectural recommendation; do not interrogate
the user for information already in the repository.

### Implementation note

`php_project_detect` already reads `composer.json`/`composer.lock`, PSR-4 roots, tool
presence, analyzer/fixer config files and `config.platform.php`. Extend its return type with
`type`, `layout`, `frameworkHints` and `fingerprint`; do not add a second detector. The
existing rendered output stays compact; the router consumes the structured result directly.

### Cache and refresh

- Cache per project root.
- Fingerprint: content hash of `composer.json`, `composer.lock` presence and relevant
  config files, plus the toolkit version.
- Refresh on prompt when the fingerprint changed; otherwise reuse.
- The full profile is available through `php_project_detect`; only a one-line summary is
  injected into model context.

Example compact profile block:

```
Project: PHP 8.2 library; PSR-4 App\; PHPUnit + PHPStan; no framework.
```

## 6. Engineering constitution (L0)

L0 is always present, small and stable. It is the behavioral baseline that applies even when
no skill is attached. It replaces the current `PHP_SYSTEM_HINT` with a slightly broader
version.

```
PHP toolkit engineering principles:
- Understand the existing code and conventions before changing them.
- Respect existing boundaries unless you can justify changing them.
- Prefer explicit dependencies and clear responsibilities.
- Avoid unnecessary abstractions, interfaces and dependencies.
- Use design patterns to solve a named design problem, not as decoration.
- Prefer simple, idiomatic PHP 8.1+ before reaching for a pattern.
- Design for foreseeable extension, not every hypothetical future.
- Test behavior and verify changes before claiming completion.
- Never invent requirements or claim unverified functionality.
- When a decision has lasting architectural consequences, explain the trade-offs.

PHP 8.1+ defaults: strict_types=1, typed signatures, PSR-4/PSR-12, PHPStan or Psalm,
PHPUnit or Pest. Rector and CS-Fixer: dry-run first, show the diff, apply only on approval.
```

L0 is pushed by `session.hook("context")` as a stable system part. It must not change per
turn, so prompt caching is preserved.

## 7. Routing

### 7.1 Two independent dimensions

A single "mode" cannot represent a request such as "add multiple payment providers, write
tests and make the integration secure." Routing uses two dimensions.

**Dimension A — task intent**

| Intent | Meaning |
| --- | --- |
| Build | Create or extend functionality. |
| Design | Make architectural or structural decisions. |
| Review | Assess existing implementation. |
| Debug | Investigate unexpected behavior. |
| Test | Testing, coverage and test strategy. |
| Maintain | Modernization, migration, dependency and refactoring work. |

**Dimension B — engineering concern**

| Concern | Skill |
| --- | --- |
| Architecture | `php-architecture` |
| Design patterns | `php-design-patterns` |
| Security | `php-security` |
| Coding standards | `php-standards` |
| Testing | `php-testing` |
| Dependencies | `php-composer` |
| Static analysis | `php-static-analysis` |
| Debugging | `php-debug` |

Intents and concerns are scored independently. A prompt may produce one intent and several
concerns; the selector combines them.

### 7.2 Signals and scoring

Signals have weights: strong = 3, medium = 2, weak = 1, negative = -3.

**Prompt signals**

- Intent verbs: build (`add`, `implement`, `create`, `extend`, `support`), design
  (`design`, `architect`, `structure`, `boundary`, `module`, `decouple`, `extensible`),
  review (`review`, `audit`, `inspect`, `PR`, `diff`), debug (`bug`, `error`, `failing`,
  `broken`, `slow`, `crash`), test (`test`, `phpunit`, `pest`, `coverage`, `fixture`),
  maintain (`upgrade`, `migrate`, `refactor`, `deprecat`, `rector`).
- Concern nouns: architecture (`layer`, `hexagonal`, `DDD`, `SOLID`, `boundary`), patterns
  (`pattern`, `strategy`, `adapter`, `factory`), security (`vulnerability`, `CVE`, `XSS`,
  `CSRF`, `auth`, `secret`), standards (`PSR`, `style`, `strict_types`), testing
  (`PHPUnit`, `Pest`, `coverage`, `mock`), dependencies (`composer`, `lock`, `autoload`),
  static analysis (`PHPStan`, `Psalm`, `baseline`), debugging (`Xdebug`, `trace`,
  `reproduce`).

**Supporting signals**

- Attached files: `.php`, `tests/`, `composer.json`, `phpstan.neon`, `psalm.xml`,
  `rector.php`, `src/Domain/`, `migrations/`.
- Active agent: `php-reviewer` → review + security + standards; `php-debugger` → debug +
  testing; `php-modernizer` → maintain + dependencies + testing; `php-tester` → testing +
  standards; `php-architect` → design + architecture + patterns + testing.
- Project profile: PHP project, PHP version, tools, application vs library, framework
  hints. These support classification; they do not independently trigger a skill.
- Recent session state: active task and loaded skills.

**Negative signals**

- Non-PHP project and no PHP-specific request.
- Framework-specific request where the toolkit has no framework skill; defer to the sibling
  toolkit with a short note.
- Explicit "just fix this" with a small, clear change: do not attach architecture/patterns.
- Prompt is a continuation with no new intent: inherit only.

### 7.3 Precedence and confidence

- Explicit `@skill-id` selections are always included.
- Strong debug, security or test signals take precedence over broad design signals when the
  budget is tight.
- Design/build routing requires at least one strong signal **and** PHP context. A PHP
  repository alone is not enough.
- If no intent reaches the threshold, attach nothing beyond L0. Do not guess.
- Confidence is represented by the score. Only concerns at or above the threshold are
  selected; lower-scoring concerns are recorded as dropped, not silently attached.

### 7.4 Follow-up inheritance and reset

- A short follow-up (for example "also add tests", "fix that", "why?") inherits the active
  intent and concerns when it contains a continuation marker and no strong new intent.
- A new strong intent updates the active intent; concerns are merged.
- A clear task switch ("new task", "unrelated", "switch to...") resets state.
- A follow-up that explicitly changes concern ("now make it secure") adds that concern
  without discarding the active task.
- Session state is conservative: when in doubt, inherit rather than re-route.

### 7.5 Selection and budget

Default budget:

- `maxSkills`: 3.
- `maxSkillChars`: 12,000.
- Hard ceiling: 4 skills / 16,000 chars, reached only when the user explicitly selects
  skills or a high-confidence security concern must replace a lower-priority skill.

Selection order:

1. Explicit skills.
2. Co-skills implied by the intent and confidence: Design → architecture + patterns;
   Build → testing, plus patterns only when the prompt shows design pressure (multiple
   variants, a new module/service, or an explicit extension point); Review → standards +
   security; Debug → debug + testing; Test → testing; Maintain → modernize/composer +
   testing.
3. High-confidence concerns.
4. Agent defaults when no strong intent exists.
5. Fill remaining budget by score.

Rules:

- Never attach a skill already loaded in this session.
- Never attach a skill the agent's permissions deny; `ask` is respected by OpenCode's normal
  resolution path, not bypassed.
- Drop the lowest-priority non-explicit skill when over budget; record the drop reason.
- Pattern skills count as one skill; their reference files are read on demand and are not
  part of the attachment budget.
- The selector returns reasons as stable codes (`intent:build`, `concern:security`,
  `file:.php`, `agent:php-architect`, `explicit:@php-testing`), never raw prompt text.

### 7.6 Explicit skills and permissions

- `event.prompt.skills` may already contain user selections; merge, do not replace.
- Preserve existing mention offsets.
- Never remove a user-selected skill.
- Skill permissions are enforced by OpenCode's normal resolution path. If an attachment is
  denied or requires approval, the plugin records it and continues; it never bypasses the
  policy.

### 7.7 Skill-loading lifecycle

On prompt:

1. Refresh the project profile if its fingerprint changed.
2. Classify intent and concerns.
3. Select skills and merge explicit selections.
4. Subtract skills already loaded in this session.
5. Attach new skills through `event.prompt.skills`.
6. Update session state; write `php-toolkit.skills` and `php-toolkit.mode` entries if the
   selection changed.
7. Record metrics.
8. Announce only on change.

On context:

1. Push L0.
2. Ensure `php-toolkit.profile`, `php-toolkit.mode` and `php-toolkit.skills` exist.
3. Inject the verification reminder for Build/Design/Test tasks.
4. Do not repeat identical state text on every request.

On compaction:

- The context hook receives `kind: "compaction"`; it does not push task state into the
  summary prompt.
- After compaction, the next prompt re-attaches missing skills; the instructions entry keeps
  the active task visible.
- If session state is lost after a plugin restart, reconstruct the active task from the
  instructions entry or the last user message in `event.messages`.

Failure handling:

- A router failure must never break prompt admission. Log, attach nothing and continue.
- A missing skill file is skipped; the catalog test should catch it at build time.
- A storage or instructions-entry failure is logged; routing still works from memory.

### 7.8 Session state model

```ts
interface SessionRoutingState {
  sessionID: string;
  activeIntents: Intent[];
  activeConcerns: Concern[];
  selectedSkills: string[];
  loadedSkills: Set<string>;
  droppedSkills: Array<{ id: string; reason: string }>;
  mode: "risk" | "strict" | "off";
  projectFingerprint: string;
  lastPromptAt: number;
  lastAnnouncement: string | null;
  verification: {
    lastRunAt: string | null;
    status: "passed" | "failed" | "partial" | "unavailable" | null;
    failedChecks: string[];
  };
}
```

State lives in an in-memory `Map<sessionID, SessionRoutingState>` and is mirrored into the
`php-toolkit.mode` / `php-toolkit.skills` instruction entries. The in-memory copy is
authoritative during a plugin lifetime; the entries are the recovery and model-facing view.

## 8. Pattern library

### 8.1 Organize by engineering problem, not by catalog number

The pattern library is problem-first. The Gang of Four names are vocabulary, not the
organizing principle.

| Engineering problem | Relevant patterns/concepts |
| --- | --- |
| Behavior varies by implementation | Strategy, polymorphism |
| Integrating different external interfaces | Adapter, Ports & Adapters |
| Behavior needs incremental extension | Decorator, middleware |
| Object behavior depends on state | State, state machine |
| Changes need to notify interested components | Observer, Domain Events |
| Object construction is complex | Builder, Factory Method, named constructors |
| Persistence needs an explicit boundary | Repository, persistence gateway, DAO |
| Infrastructure needs isolation | Ports & Adapters, Dependency Injection |
| Legacy integration needs a seam | Anti-Corruption Layer, Strangler Fig |
| Traversal over a heterogeneous structure | Visitor, Iterator |
| Undo/redo or queued operations | Command, Memento |
| Query/report complexity | CQRS, read models |
| Transaction boundaries across aggregates | Unit of Work |
| Cross-cutting concerns | Decorator, Proxy, middleware |
| Complex subsystem | Facade |

### 8.2 Hybrid loading structure

- **`php-design-patterns`** — a compact router skill. Contains the problem→pattern table,
  guardrails and the instruction to read at most two references. Advertised or hidden is
  decided by the Phase 1 validation; the default plan is advertised, because it is the
  fallback when the router misses.
- **Core pattern skills** — hidden (`autoinvoke: false`) specialized skills for the most
  frequent problems:
  - `php-pattern-strategy`
  - `php-pattern-adapter`
  - `php-pattern-decorator`
  - `php-pattern-state`
  - `php-pattern-observer`
  - `php-pattern-builder`
  - `php-pattern-factory-method`
  - `php-pattern-repository`
  - `php-pattern-ports-adapters`

  The router attaches at most one core pattern skill per task. The rest are available
  through the `php-design-patterns` index.
- **Long-tail references** — `skills/php-design-patterns/references/*.md`:
  command, composite, facade, proxy, chain-of-responsibility, specification, unit-of-work,
  cqrs, event-sourcing, ddd-tactical, anti-corruption-layer, strangler-fig, null-object,
  template-method, visitor, iterator, mediator, memento, flyweight, bridge, abstract-factory,
  prototype, singleton (anti-pattern note), object-pool (PHP-FPM caveat), dependency
  injection, enums-as-state, readonly-dto, named-constructors, first-class-callables,
  generators, attributes, traits-vs-composition.

### 8.3 Reference template

Every reference uses the same sections:

```
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

The "When not to use" and "Testing" sections are mandatory. A pattern file without them
fails the catalog test.

### 8.4 Guardrails

Guardrails are defaults, not absolute rules:

- Avoid Singleton as an application-wide dependency-management mechanism.
- Avoid Service Locator because it hides dependencies.
- Prefer composition when it makes dependencies and behavior clearer.
- Do not introduce an interface or factory without a demonstrated second implementation or
  a real test seam.
- Prefer the simplest design that satisfies present requirements while leaving sensible
  extension points.
- Do not introduce patterns merely because a pattern exists.
- Repository is not automatically good: use it when a collection-like persistence boundary
  and a test seam are genuinely needed; a simple persistence service or DAO may be enough.
- Inheritance and static methods are not automatically bad; judge them by coupling,
  testability and clarity.
- If a pattern makes tests harder, reconsider the pattern.

### 8.5 PHP 8.1+ idioms

The library teaches idiomatic PHP before GoF patterns:

- `readonly` DTOs and value objects.
- Native enums for state and finite sets.
- Named constructors for valid creation.
- First-class callables and closures for strategies.
- `match` for exhaustive mapping when it stays simple.
- Attributes for metadata.
- Generators for lazy iteration.
- Traits only for orthogonal behavior, not as a substitute for composition.
- Constructor promotion and typed properties by default.

### 8.6 Pattern selection rule

A pattern is introduced only when:

1. A named pain exists (variation, coupling, construction complexity, boundary leak).
2. The forces are understood (change frequency, number of variants, test seams, team size,
   PHP version).
3. The pattern removes more complexity than it adds.
4. The trade-off and the rejected simpler option are stated.

The agent should say what it is **not** doing as clearly as what it is doing.

## 9. Architecture behavior

### 9.1 Risk-based autonomy

The universal "do not implement until the design is approved" rule is removed. Behavior
scales with impact:

| Change type | Behavior |
| --- | --- |
| Small, reversible (single method/class, no public API or dependency change) | Decide, implement, state a one-line rationale. |
| Moderate design impact (new service/module/interface, multiple classes, new dependency) | Inspect, state the chosen pattern and trade-off in 2–3 lines, proceed unless the user asked for design only. |
| Significant architectural impact (module boundaries, persistence architecture, messaging/events, DI strategy) | Present 2–3 options with trade-offs, blast radius and test strategy; seek approval. |
| Breaking public API change | Seek approval. |
| Security or data-model implications | Discuss material consequences before proceeding. |

### 9.2 Modes

- `architectureMode: "risk"` (default) — the table above.
- `architectureMode: "strict"` — all Design/Build tasks present a design note and wait for
  approval. This is opt-in.
- `architectureMode: "off"` — no architecture mode; skills may still attach.

### 9.3 Commands and agent

- `/php-design` — produce a design note (context, forces, options, recommendation, test
  plan). It proceeds with implementation when the user asked for implementation and the
  change is not significant; otherwise it stops for approval.
- `/php-architect` — full design-first workflow, always stops for approval. It switches to
  the `php-architect` agent when available; otherwise it injects the architect protocol
  inline.
- `php-architect` agent — design-first, read-only until approval. Ships as
  `agents/php-architect.md` and is copied by `postinstall.mjs`, matching the existing agent
  pattern. It is the only new specialist agent.

### 9.4 ADR policy

Create an ADR only when a decision has lasting architectural consequences, for example:

- persistence architecture
- module boundaries
- event/messaging architecture
- extension mechanism
- dependency-injection strategy
- public API/BC policy

A new helper class, a small refactor or a local pattern does not warrant an ADR. The
`/php-architect` workflow may offer an ADR template; it does not create the file without
the user's request.

## 10. Verification layer

Instructions alone cannot guarantee good engineering. The toolkit must check the result.

### 10.1 `php_verify` tool

Namespace: `php`. Read-only. Never installs dependencies, never edits project
configuration, never ignores an existing failure.

Input:

```json
{
  "type": "object",
  "properties": {
    "directory": { "type": "string" },
    "scope": { "enum": ["changed", "all"], "default": "changed" },
    "checks": {
      "type": "array",
      "items": {
        "enum": ["lint", "composer", "tests", "static", "style", "architecture"]
      }
    },
    "paths": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false
}
```

Checks:

| Check | Detection | Command / behavior |
| --- | --- | --- |
| `lint` | Always | `php -l` on changed or provided PHP files; cap file count. |
| `composer` | `composer.json` present | `composer validate --strict --no-check-publish`. |
| `tests` | PHPUnit/Pest config or dev dependency | `vendor/bin/phpunit` or `vendor/bin/pest`; focused paths when provided; no coverage by default. |
| `static` | PHPStan/Psalm config or dev dependency | PHPStan `analyse --no-progress --error-format=json`; Psalm `--output-format=json --no-progress`. |
| `style` | PHP-CS-Fixer/PHPCS config or dev dependency | CS-Fixer `fix --dry-run --diff --using-cache=no`; PHPCS read-only. |
| `architecture` | `php-toolkit.json` layers or Deptrac config | Scanner boundary check or `deptrac analyse`; advisory. |

Rules:

- Detect what the project has; skip unavailable checks with a clear reason.
- Distinguish `passed`, `failed`, `warning`, `skipped` and `unavailable`.
- Do not install tools.
- Do not modify configuration to make a check pass.
- Do not silently ignore existing failures.
- Cap output at 24,000 characters.
- Respect `AbortSignal` and per-check timeouts.
- Return a report even when individual checks fail; `status: "error"` only when the tool
  could not run at all.

Output shape:

```
PHP verification (scope: changed)
✅ lint       3 files, 0 errors
✅ composer   valid
⚠️ tests      not configured (no phpunit.xml / Pest.php)
❌ static     2 errors (PHPStan level 6)
⏭️ style      php-cs-fixer not installed
⏭️ architecture no boundaries configured

Summary: 2 passed, 1 failed, 1 warning, 2 skipped.
Next: fix the PHPStan errors, then rerun php_verify.
```

### 10.2 Completion workflow

For Build, Design and Test intents, the model-facing state entry includes:

```
Before declaring completion: run php_verify (scope: changed), or explicitly report which
checks are unavailable and why. Never claim a feature works without evidence.
```

The plugin does not block the final response. The reminder and the tool are enough; the
user can always ask for verification explicitly.

### 10.3 Integration with existing tools

`php_verify` is an orchestrator and report layer. It calls the same underlying functions as
the existing tools instead of duplicating their parsing:

- `php_lint` → `php -l`; `composer validate` is called separately so the report can show
  lint and composer as distinct checks without running validation twice.
- `php_composer_audit` → audit (network; not run by `php_verify` unless explicitly requested).
- `php_composer_outdated` → outdated (network; not run by `php_verify` unless explicitly
  requested).
- `php_static_analysis` → PHPStan/Psalm JSON parsing and finding counts.
- `php_test` → PHPUnit/Pest JUnit parsing and failure attribution.
- `php_project_detect` → profile and config-file discovery.

`php_lint`, `php_composer_audit`, `php_composer_outdated`, `php_static_analysis`, `php_test`
and `php_metrics` keep their current behavior. `php_verify` adds the cross-check report,
style check, architecture check and the completion reminder. If `php_test`'s current
`filter` input is insufficient for changed-file scope, `php_verify` passes paths to the
runner directly rather than changing the existing tool's public input. Metrics record
verification runs, pass/fail/skipped counts and findings.

## 11. Architecture scanner

### 11.1 Philosophy

The scanner distinguishes:

- **Objective finding** — a structural characteristic, e.g. "conditional branching on four
  concrete payment implementations at `src/Payment/PaymentProcessor.php:45`."
- **Architectural hypothesis** — a possible design pressure, e.g. "Consider whether payment
  behavior varies independently and is expected to grow. Strategy may be appropriate, but
  first assess the actual variation and extension requirements."

It never says "this is a violation" without configured boundaries. It never refactors.

### 11.2 P0 detections

- Project and source structure inventory.
- Namespace and import relationships.
- Class, method and constructor metrics: LOC, method count, parameter count.
- Static state and common dependency-coupling indicators.
- Explicitly configured architectural dependency rules.
- Potentially suspicious structural patterns, clearly labelled as suggestions:
  - `instanceof` chains and `switch`/`match` on a type-like value with three or more
    branches.
  - singleton/static access patterns.
  - constructors with more than four parameters.
  - classes with more than 15 public methods (heuristic).
  - classes over 400 LOC or methods over 50 LOC (heuristic).

Removed from P0:

- Automatic anemic-domain detection (too subjective).
- Automatic "god service" verdicts (report only as a heuristic).
- Inferred layer violations from folder names.

### 11.3 Explicit boundaries

Without configuration, the scanner reports structure and metrics only. Boundaries are
declared in an optional `php-toolkit.json` at the project root:

```jsonc
{
  "architecture": {
    "layers": {
      "Domain": {
        "namespaces": ["App\\Domain\\"],
        "mayDependOn": []
      },
      "Application": {
        "namespaces": ["App\\Application\\"],
        "mayDependOn": ["Domain"]
      },
      "Infrastructure": {
        "namespaces": ["App\\Infrastructure\\"],
        "mayDependOn": ["Domain", "Application"]
      }
    },
    "exclude": ["vendor", "node_modules", "var", "storage"]
  },
  "routing": {
    "disableSkills": [],
    "extraSkills": []
  }
}
```

This is a project-local contract, not a framework convention. It is validated at runtime;
invalid configuration produces a clear error and disables boundary checks rather than
guessing.

### 11.4 Scanner implementation

- `scripts/architecture-scan.php`, invoked as
  `php scripts/architecture-scan.php --directory <dir> --format json`.
- Uses PHP's built-in `token_get_all`; no Composer dependency.
- Read-only; no network; no writes.
- Excludes `vendor`, `node_modules`, `.git`, `var`, `storage` and configured excludes.
- `maxFiles` default 500; report truncation.
- Timeout 20 seconds; respect `AbortSignal`.
- Output JSON with `kind: "finding" | "hypothesis" | "metric"`, `severity`, `file`, `line`,
  `message`, `evidence`, `candidatePatterns`, `confidence`.

### 11.5 Cache

- Cache key: scanner version + project fingerprint + configuration fingerprint + file list
  fingerprint (`path:size:mtimeMs`).
- Not mtime-only.
- In-memory cache plus optional `ctx.storage` cache for cross-session reuse.
- Invalidate on file changes, config changes or toolkit upgrade.

### 11.6 Modes and privacy

- `architectureScan: "tool"` (default) — on-demand only. This is the least-friction
  default.
- `architectureScan: "auto"` — run for high-confidence Design tasks, cached, with a 2-second
  budget. If the budget is exceeded, skip and leave the tool available. The summary is
  injected as an instructions entry; full details require the tool.
- `architectureScan: "off"` — no scanner tool registration and no auto mode.
- Auto summaries contain file paths and finding kinds, not code snippets. The README must
  note that this summary becomes model context and may be sent to a remote provider.
- The scanner is advisory. It never edits code or blocks a task.

## 12. Surfaces

### Skills

Existing eight remain and keep their IDs:

`php-standards`, `php-static-analysis`, `php-testing`, `php-security`, `php-modernize`,
`php-composer`, `php-architecture`, `php-debug`.

New:

- `php-design-patterns` — router/index skill.
- Nine hidden core pattern skills (Section 8.2).

Skill descriptions are tightened to include trigger phrases, so the fallback path works
when the router misses.

### Agents

Existing four remain unchanged:

`php-reviewer`, `php-debugger`, `php-modernizer`, `php-tester`.

New:

- `php-architect` — design-first, read-only until approval.

No additional specialist agents are added. The router is the primary path; agents are for
explicit deep dives.

### Commands

Existing seven remain unchanged.

New:

- `/php-design` — design note, fluid by default.
- `/php-architect` — full design-first workflow, approval gate.
- `/php-toolkit-status` — diagnostics: profile, active intent/concerns, selected skills,
  reasons, loaded skills, config, last verification, last scan.

### Tools

Existing on the latest improvement branch:

`php_project_detect`, `php_lint`, `php_composer_audit`, `php_composer_outdated`,
`php_static_analysis`, `php_test`, `php_metrics`.

New:

- `php_verify` — orchestrates the available checks and returns one report.
- `php_architecture_scan` — read-only architecture scanner (Phase 5).

No existing tool is removed or renamed. `php_verify` reuses the underlying check functions
so test/static-analysis parsing and finding counts stay in one place.

### Hooks

- `session.hook("prompt")` — routing and skill attachment.
- `session.hook("context")` — L0 constitution and state presence.
- `tool.hook("execute.before")` — existing destructive-pattern warning.
- `tool.hook("execute.after")` — optional metrics for skill loads and verification runs;
  no user-facing noise.

### Announcements

- Model-facing: `php-toolkit.skills` / `php-toolkit.mode` instructions entries, updated only
  when the selection changes.
- User-facing: announce on change only. Use a synthetic status message only if the host
  treats it as non-turn-triggering; otherwise rely on `/php-toolkit-status` and the console
  log. Never rewrite the user's prompt to announce routing.
- `announceSelections`: `"on-change"` (default), `"always"`, `"off"`.

## 13. Configuration

Plugin options (all optional; defaults preserve the least-friction behavior):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-php-toolkit",
      "options": {
        "autoSkills": "attach",
        "maxSkills": 3,
        "maxSkillChars": 12000,
        "architectureMode": "risk",
        "architectureScan": "tool",
        "announceSelections": "on-change",
        "verification": "remind"
      }
    }
  ]
}
```

| Option | Values | Default | Meaning |
| --- | --- | --- | --- |
| `autoSkills` | `attach` \| `hint` \| `off` | `attach` | Attach skills, only recommend them, or disable routing. |
| `maxSkills` | integer 1–4 | `3` | Soft budget; explicit selections bypass. |
| `maxSkillChars` | integer | `12000` | Soft character budget for attached skill content. |
| `architectureMode` | `risk` \| `strict` \| `off` | `risk` | Risk-based, always-approval, or disabled. |
| `architectureScan` | `tool` \| `auto` \| `off` | `tool` | On-demand, auto for strong design intent, or disabled. |
| `announceSelections` | `on-change` \| `always` \| `off` | `on-change` | Visibility of routing decisions. |
| `verification` | `remind` \| `off` | `remind` | Include the completion checklist for Build/Design/Test. |

Project-local `php-toolkit.json` (optional) supports architecture boundaries and routing
overrides as described in Section 11.3. Project-local routing overrides take precedence over
global plugin options for that project; architecture boundaries are project-local only.
Invalid values fall back to defaults with a clear console warning; the plugin never fails to
load because of bad options.

Escape hatches:

- `autoSkills: "off"` restores the old passive behavior.
- `architectureMode: "off"` disables design gating.
- `architectureScan: "off"` disables the scanner.
- `verification: "off"` removes the completion reminder; the tool remains available.

## 14. Metrics and observability

Extend the local metrics document to version 3. Migration from v2 adds empty sections.

New counters:

```ts
interface RoutingMetrics {
  selections: Record<string, { count: number; lastUsedAt: string }>;
  intents: Record<string, number>;
  concerns: Record<string, number>;
  dropped: Record<string, number>;
  announcements: number;
}

interface VerificationMetrics {
  runs: number;
  passed: number;
  failed: number;
  partial: number;
  unavailable: number;
  findings: number;
  lastRunAt: string | null;
}

interface ScannerMetrics {
  runs: number;
  findings: number;
  hypotheses: number;
  truncated: number;
  lastRunAt: string | null;
}
```

`php_metrics` gains sections for routing, verification and scanning. It never stores prompt
text, code, file contents or absolute paths in user-facing output. Reason codes are stable
categories (`intent:build`, `concern:security`, `file:.php`), not raw keywords from the
prompt. Preserve the existing `reset` and `export` flags; both rendered and JSON output
include the new sections, and `export` continues to omit absolute paths.

`/php-toolkit-status` is the diagnostic surface:

```
PHP toolkit status
  Project: my-app (application, PHP 8.2, PHPUnit + PHPStan)
  Active:  build + design | concerns: architecture, patterns, testing
  Selected: php-architecture, php-design-patterns, php-testing
  Loaded:   php-testing
  Dropped:  php-security (budget)
  Mode:     risk | scan: tool | announce: on-change
  Verify:   last run 2026-11-04 09:12Z — 2 passed, 1 failed
```

## 15. Testing and evaluation

### Unit tests

- Classifier corpus: representative prompts with expected intents, concerns and skills.
- Budget: max skills, max chars, explicit bypass, dropped reasons.
- Negative cases: non-PHP prompt, framework-specific prompt, ambiguous "fix this".
- Follow-up inheritance and task reset.
- Agent and file signals.
- Project profile detection: application, library, unknown, no composer, framework hint,
  tool detection.
- Catalog integrity: every skill ID has a catalog entry and a markdown file; every pattern
  reference has the required sections.

### Integration tests

- Prompt hook with a fake event: selected skills are added, existing skills are preserved,
  no throw on malformed input.
- Context hook: L0 is pushed, state entries are not duplicated.
- Permissions: denied skills are not attached; `ask` is not bypassed.
- Instructions entry: state is written and recovered.
- Verification tool: fake `php`, `composer`, `phpunit`, `phpstan`, `php-cs-fixer` binaries;
  pass, fail, skip and unavailable paths.
- Scanner: fixture PHP files for layers, imports, type switches, static state and metrics;
  JSON parser tests that do not require PHP; a PHP-enabled CI job for the script itself.

### Fixtures

Add:

- `fixtures/php-app/` — application layout, public entry point, migrations.
- `fixtures/php-library/` — library layout, public API, no app entry point.
- `fixtures/php-legacy/` — no Composer, mixed layout.
- `fixtures/php-framework/` — composer.json with framework hints, no framework code.
- `fixtures/php-bad-architecture/` — layer violations, fat class, type switch, singleton.
- `fixtures/php-no-tools/` — PHP project with no test/static/style tooling.

### Evaluation scorecard

Measure the toolkit with and without routing on the fixture matrix:

| Metric | Target |
| --- | --- |
| Precision on strong/explicit prompts | ≥ 90% |
| False-positive routing on non-PHP/ambiguous prompts | < 5% |
| Context attached per route | ≤ 3 skills and ≤ 12k chars in 95% of routes |
| Build/Design tasks with a verification reminder | 100% |
| Build/Design tasks that run at least one available check | ≥ 80% |
| Existing test suite | No regressions |
| Agent output quality (design rationale, pattern fit, tests) | Materially better than toolkit-off baseline |

The primary product question is not "did it select `php-architecture`?" It is "did the agent
produce a materially better result with the toolkit enabled?"

## 16. Phases and acceptance criteria

### Phase 1 — Foundation (P0)

Deliverables:

- Engineering constitution (L0).
- Project Profile service and cache.
- Routing catalog for existing eight skills.
- Two-dimensional classifier and selector.
- Prompt hook attachment, session state, instructions entries.
- Config parsing and escape hatches.
- `/php-toolkit-status`.
- Metrics v3 migration.
- Unit and integration tests for routing.

Acceptance:

- A review prompt attaches review-relevant skills; a build prompt attaches build-relevant
  skills; a non-PHP prompt attaches nothing.
- Explicit `@skill-id` always wins.
- Budget is enforced; dropped skills have reason codes.
- No prompt-admission failure when routing or storage fails.
- Existing tests pass; new routing corpus passes.
- Status command shows profile, selection and reasons.

### Phase 2 — Pattern library and architecture behavior (P0)

Deliverables:

- `php-design-patterns` router skill.
- Nine hidden core pattern skills.
- Long-tail references with the required template.
- Risk-based architecture mode and state instructions.
- Guardrails and pattern selection rules.
- Catalog/content validation tests.

Acceptance:

- A design prompt attaches `php-architecture` + `php-design-patterns` (+ testing when
  appropriate).
- A narrow pattern prompt attaches the relevant core pattern skill.
- The model reads at most two references in the evaluation runs.
- Small changes are not gated; significant changes request approval.
- Pattern-tourism review of the evaluation corpus passes.

### Phase 3 — Verification (P0)

Deliverables:

- `php_verify` tool with lint, composer, tests, static, style and architecture checks.
- Orchestration of the existing `php_lint`, `composerValidate`, `php_static_analysis` and
  `php_test` functions; no duplicate parsers. Audit and outdated remain separate network
  tools.
- Tool detection, timeouts, AbortSignal, output caps.
- Completion reminder for Build/Design/Test.
- Verification metrics.
- Fake-binary tests.

Acceptance:

- The tool runs available checks and reports pass/fail/skip/unavailable accurately.
- It never installs tools or edits configuration.
- Existing failures are not ignored.
- Build/Design tasks include the completion reminder.
- Evaluation shows improved completion reporting.

### Phase 4 — Architect surface and diagnostics (P1)

Deliverables:

- `php-architect` agent.
- `/php-design`, `/php-architect`.
- Extend `/php-toolkit-status` with verification and scan state.
- Postinstall copy for the new agent.
- README updates.

Acceptance:

- Agent file is copied on install.
- `/php-design` produces a design note and proceeds for non-significant changes.
- `/php-architect` always stops for approval.
- Status command reflects routing and verification state.

### Phase 5 — Architecture scanner (P1)

Deliverables:

- `scripts/architecture-scan.php` using `token_get_all`.
- `php_architecture_scan` tool.
- `php-toolkit.json` boundary configuration.
- Cache with content/config/version fingerprint.
- Fixture tests and performance caps.

Acceptance:

- Scanner reports objective findings and architectural hypotheses separately.
- No layer violation is reported without configured boundaries.
- Cache invalidates on file/config/toolkit changes.
- Scanner is read-only and respects maxFiles/timeout.
- Auto mode is opt-in and bounded.

### Phase 6 — Drift detection and feedback (P2)

Deliverables:

- `tool.execute.after` signals for edited PHP files.
- Optional auto-lint on edit (config-gated).
- Architecture drift summary after boundary-relevant edits.
- Metrics for drift findings.

Acceptance:

- No noisy reminders on every edit.
- Config can disable all feedback.
- Performance remains acceptable on large repositories.

### Phase 7 — Advanced routing (P3)

Deliverables:

- Optional LLM-assisted classifier behind a flag, with deterministic fallback.
- Shared router contract for sibling toolkits.
- More pattern references and evaluation cases.

Acceptance:

- Deterministic routing remains the default.
- LLM routing never runs without explicit opt-in.
- Sibling toolkits can reuse the router without forking it.

## 17. Migration and compatibility

- Start implementation from the latest improvement branch (or `main` after PR #4) so
  `php_test`, `php_static_analysis`, `php_composer_outdated` and the enriched
  `php_project_detect` are present. Do not reimplement them in the router.
- Existing skill IDs, command names, tool names and agent files remain valid.
- Existing behavior is available through `autoSkills: "off"`.
- `PHP_SYSTEM_HINT` is replaced by the L0 constitution; the PHP-specific defaults are
  preserved in L0.
- Metrics v2 documents migrate to v3 by adding empty routing/verification/scanner sections.
- New configuration is optional; defaults are chosen for least friction.
- The new behavior is a minor version bump (target `0.2.0` for Phase 1; later phases may
  ship as `0.3.0`, `0.4.0`, etc.). The README and changelog must call out the behavior
  change.

## 18. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Prompt hook cannot attach hidden skills as expected. | Validate in Phase 1; fallback to an advertised `php-design-patterns` router skill + references. |
| Instructions entries are not visible or do not survive compaction. | Validate; fallback to a stable context-hook system part. |
| Routing is too eager or too blunt. | Precision over recall, confidence thresholds, explicit wins, corpus tests, session stickiness. |
| Context bloat. | L0–L3, max 3 skills / 12k chars, hidden pattern skills, on-demand references. |
| Architecture gatekeeping annoys users. | Risk-based default, strict mode opt-in, fluid `/php-design`, one-line rationale for small changes. |
| Pattern tourism. | Problem-first library, "when not to use", two-implementation/test-seam rule, evaluation corpus. |
| Scanner overclaims. | Advisory findings vs hypotheses, explicit boundaries, no anemic-domain detection, no inferred violations. |
| Verification noise or false failures. | Detect available tools, distinguish skipped/unavailable, no installs/config edits, output caps, changed-file scope. |
| Privacy leakage. | No prompt text/code in metrics; scan summaries contain file paths and finding kinds only; README documents model-bound data. |
| Performance. | Cache profiles and scans, timeouts, maxFiles, no auto scan by default, no per-turn state churn. |
| Maintenance burden. | Catalog integrity tests, shared router contract, content template validation. |
| User distrust of automatic behavior. | Announce on change, `/php-toolkit-status`, config escape hatches, no prompt rewriting. |

## 19. Validation assumptions

These are validated in Phase 1 before the pattern library is built:

1. `event.prompt.skills` attaches skill bodies through the normal resolution path.
2. A skill with `autoinvoke: false` (or the equivalent `disable-model-invocation: true`
   used by the prior prototype) can be attached by ID via the prompt hook.
3. Skill permissions (`ask`/`deny`) are respected and not bypassed.
4. Attaching a skill the model already loaded does not duplicate content, or the plugin can
   avoid re-attachment through session state.
5. `session.instructions.entry` values are visible to the model and survive compaction.
6. `ctx.session.get` is fast enough to read the active agent in the prompt hook.
7. Prompt hooks run for command-submitted prompts (`ctx.session.prompt`).
8. Synthetic status messages, if used, do not trigger an unwanted model turn.
9. `ctx.vcs` or `git diff` is available for changed-file scope in `php_verify`.
10. The latest improvement branch's `php_test`, `php_static_analysis`,
    `php_composer_outdated` and enriched `php_project_detect` are available to compose.
11. The hidden-skill prototype's registration path is reusable; if not, the router falls
    back to an advertised `php-design-patterns` skill with references.

If any assumption fails, the fallback is documented in Section 18 and the phase scope is
adjusted before implementation proceeds.

## 20. Self-review

- No placeholders or unresolved decisions.
- The design is phased; each phase is independently shippable.
- Existing surfaces are preserved; the new behavior is opt-out.
- Least-friction defaults are explicit: risk-based architecture, on-demand scanning,
  announce-on-change, no prompt rewriting.
- The three layers are covered: knowledge (skills/references), guidance (router/profile/
  constitution), verification (`php_verify`).
- The scanner's limits are explicit; it is advisory and boundary-driven.
- The pattern library is problem-first and includes "when not to use."
- The verification layer distinguishes passed, failed, skipped and unavailable checks.
- Testing covers routing, profile, content integrity, verification, scanner and end-to-end
  evaluation.

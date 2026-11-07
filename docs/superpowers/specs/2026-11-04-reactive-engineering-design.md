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
3. **Verification** — a non-mutating `php_verify` workflow that checks the result instead of
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

PR #4 (merged in `4011468`) also adds `php_composer_outdated`, `php_static_analysis`,
`php_test` and a richer `php_project_detect` (analyzer/fixer config files, `platform.php`);
these are present on `main`. The verification layer composes these tools; it does not
reimplement their parsing.

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
9. **Session-scoped context.** Project discovery and routing state belong to the session's
   project root and subpath, not to the plugin's install directory. Global installs and
   worktrees must not share a profile by accident.
10. **Non-mutating by default.** Verification never edits source, manifests or project
    configuration. It may execute project code (tests, static analysis), so it respects the
    host's permission model and does not pretend those executions are side-effect free.

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenCode v2 plugin                          │
│                                                                     │
│  setup(ctx)                                                         │
│    ├─ load skills + routing catalog                                 │
│    ├─ register tools: php_* (existing + verify + architecture scan) │
│    ├─ register commands and agents                                  │
│    ├─ subscribe to session.skill.activated events                   │
│    └─ register hooks                                                │
│                                                                     │
│  per session                                                        │
│    session.get(sessionID) → location.directory + subpath            │
│    → resolve ProjectProfile for that root (cached by root+subpath)  │
│                                                                     │
│  session.hook("prompt")                                             │
│    profile → classify → select → merge explicit → subtract activated│
│    → event.prompt.skills.push(...) → update SessionState → metrics  │
│                                                                     │
│  session.hook("context")                                            │
│    replace any prior php-toolkit system part                        │
│    push L0 constitution (stable) + compact state system part        │
│                                                                     │
│  session.hook("compaction")                                         │
│    no-op by default; never inject task state into the summary       │
│                                                                     │
│  ctx.storage (best-effort)                                          │
│    php-toolkit:session:<sessionID> — profile, task generation,      │
│    selected/attached/activated skills, verify state (no prompt text)│
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
| `ProjectProfile` | Read-only project discovery, resolved per session root and cached by root + subpath. |
| `Classifier` | Deterministic intent × concern scoring from prompt, files, agent, profile and session state. |
| `Selector` | Map classification to skills, enforce budget, respect explicit selections and permissions. |
| `SessionState` | Track task generation, selected/attached/activated skills, announcements and verification state. |
| `SkillCatalog` | Routing metadata for every skill; markdown remains the content source of truth. |
| `PromptRouter` | Attach selected skills via `event.prompt.skills`; never rewrite the user's prompt. |
| `ContextState` | Inject the L0 constitution and keep model-facing state current. |
| `SkillActivationTracker` | Subscribe to `session.skill.activated`; mark a skill loaded only after activation. |
| `Verifier` | Run available project checks and produce a normalized pass/fail/skipped report. |
| `ArchitectureScanner` | Read-only token-based structure analysis, advisory only. |
| `Metrics` | Local, privacy-safe counters for routing, verification and scanning. |

### Data flow

1. Plugin setup loads skill markdown, routing metadata and registers hooks and event
   subscriptions. It does not discover a single project root.
2. On a prompt, the plugin resolves the session's `location.directory` and `subpath`, then
   loads or refreshes the `ProjectProfile` for that root.
3. The prompt hook classifies the task and selects skills.
4. Selected skills are merged with explicit `@skill-id` selections and attached through
   `event.prompt.skills`. A selected skill is not treated as loaded until
   `session.skill.activated` reports it.
5. Session state is updated in memory and persisted best-effort to `ctx.storage`. No prompt
   text or code is stored.
6. The context hook removes any previous php-toolkit system part, then appends the stable L0
   constitution and one compact state system part. This happens on every agent-loop model
   request, including tool continuations, without duplicating parts.
7. The compaction hook is a separate hook and does not inject task state into the summary.
8. For build/design tasks, the state system part includes the verification reminder.
9. The model may call `php_verify` and `php_architecture_scan`; the toolkit never runs them
   automatically in the default configuration.
10. Metrics are recorded locally; no prompt text or code is stored.

## 5. Project Profile

Project awareness is foundational. The router must not treat a Composer package, a legacy
application and a framework app as the same environment.

### Profile fields

```ts
type ProjectType = "application" | "library" | "unknown";
type Confidence = "high" | "medium" | "low";

interface ProjectProfile {
  root: string;                        // session location.directory
  subpath: string | null;              // session subpath, when present
  type: ProjectType;
  typeConfidence: Confidence;
  typeEvidence: string[];              // stable codes, never prompt text
  phpRequirement: string | null;       // composer.json require.php
  hasComposerJson: boolean;
  hasComposerLock: boolean;
  autoloadPsr4: Record<string, string>;
  packageName: string | null;
  packageType: string | null;          // explicit composer.json type only
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
    hasConfigDir: boolean;
    hasTemplates: boolean;
  };
  fingerprint: string;                 // content hash: composer + config + toolkit version
  lockFingerprint: string | null;      // content hash of composer.lock
}
```

### Application vs library

Composer's schema defaults `type` to `library` when the field is omitted. That default is
not evidence about the product: many applications omit the field. The toolkit therefore
treats a missing or unrecognized `type` as **neutral**, never as a library signal.

Classification uses multiple signals and a confidence score. Each signal is counted once.

| Evidence | Score | Stable code |
| --- | --- | --- |
| Explicit `composer.json` `type: project` | Application +3 | `composer:type=project` |
| Explicit `composer.json` `type: library` | Library +2 | `composer:type=library` |
| `public/index.php` exists | Application +2 | `layout:public-index` |
| `bin/console` exists | Application +2 | `layout:console-bin` |
| `config/` exists | Application +1 | `layout:config-dir` |
| `migrations/` exists | Application +1 | `layout:migrations` |
| `templates/` or `views/` exists | Application +1 | `layout:templates` |
| Framework runtime in `require` (Laravel/Symfony full-stack) | Application +1 | `composer:framework-runtime` |
| No `public/index.php` and no `bin/console` | Library +1 | `layout:no-entry-point` |
| Only `src/` + `tests/` (plus optional tooling `bin/`) | Library +1 | `layout:package-shape` |
| PSR-4 autoload present and no framework runtime | Library +1 | `composer:no-framework-runtime` |
| Release/BC metadata (`CHANGELOG`, `UPGRADING`, semver policy) | Library +1 | `layout:release-metadata` |

Rules:

- `application` when `applicationScore >= 3` **and**
  `applicationScore - libraryScore >= 2`.
- `library` when `libraryScore >= 3` **and**
  `libraryScore - applicationScore >= 2`.
- Otherwise `unknown`. Conflicting or weak evidence never forces a type.
- Confidence: `high` when the winning margin is `>= 4`, `medium` when it is `2–3`, `low`
  for `unknown`.
- `typeEvidence` records the stable codes that contributed, so the status command and tests
  can explain the result without exposing file contents.

If the type is `unknown` or confidence is `low`, use neutral guidance. Ask one focused
question only when the answer materially changes an architectural recommendation; do not
interrogate the user for information already in the repository.

### Implementation note

`php_project_detect` already reads `composer.json`/`composer.lock`, PSR-4 roots, tool
presence, analyzer/fixer config files and `config.platform.php`. Extend its return type with
`type`, `typeConfidence`, `typeEvidence`, `layout`, `frameworkHints`, `fingerprint` and
`lockFingerprint`; do not add a second detector. The existing rendered output stays compact;
the router consumes the structured result directly.

### Session root resolution

`setup(ctx)` runs once per plugin instance. `ctx.location` identifies where the plugin was
loaded, not the project root of every session. The profile is resolved per session:

1. Read `ctx.session.get({ sessionID })`.
2. Use `session.location.directory` as the root and `session.subpath` as the optional
   relative scope.
3. If the session has no location, fall back to `ctx.location.directory` and record
   `profile:root-fallback` in diagnostics.
4. Cache by `root + "\0" + subpath`. Worktrees and multiple repositories never share a
   profile entry.
5. Tools and commands default `directory` to the session root, not the plugin install root.

### Cache and refresh

- Cache per resolved `root + subpath`.
- `fingerprint`: content hash of `composer.json`, relevant config files (`phpunit.xml`,
  `phpunit.xml.dist`, `Pest.php`, `phpstan.neon*`, `psalm.xml`, `.php-cs-fixer.php`,
  `phpcs.xml*`, `rector.php`, `deptrac.yaml`, `php-toolkit.json`) plus the toolkit version.
- `lockFingerprint`: content hash of `composer.lock` when present. A lock change invalidates
  dependency/tool information even when `composer.json` is unchanged.
- Refresh on prompt when either fingerprint changed; otherwise reuse.
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

### 7.2 Signal dictionary and matching

Routing must be reproducible: two implementations given the same prompt, files, agent and
profile must produce the same selection. The classifier is therefore a pure function over a
fixed dictionary.

**Matching rules**

1. Normalize the prompt with Unicode NFKC, lowercase it and collapse whitespace.
2. Remove fenced code blocks (triple-backtick or `~~~`) before prose matching. Keep them for
   file-path detection.
3. Match multi-word phrases before single tokens; the longest phrase wins and its tokens are
   consumed so overlapping phrases do not double-count.
4. Single tokens match on Unicode word boundaries. A trailing `*` means prefix matching.
   Signal entries are explicit; the catalog lists variants rather than applying a general
   stemmer at runtime.
5. Each signal ID counts at most once per prompt, regardless of how often it appears.
6. Sum distinct signal weights per target and cap each target at `6`.
7. Remove explicit `@skill-id` mentions before scoring so they do not create keyword noise.

**Intent signals**

| Target | Weight 3 | Weight 2 | Weight 1 |
| --- | --- | --- | --- |
| Build | add, implement, create, build, extend, support, introduce, integrate, generate, scaffold | new feature, feature request, endpoint, handler, service, module, command, job, listener, controller | change, update, modify, adjust, allow |
| Design | design, architect, architecture, restructure, decouple, boundary, boundaries, modular, modularize, extensible, extension point, layering, hexagonal, clean architecture, ddd, domain-driven | pattern, split, extract, abstract, interface, contract, port, adapter, refactor structure | structure, component, separation, dependency direction |
| Review | review, code review, pr review, pull request review, audit, inspect, assess, critique | diff, patch, changes, feedback, findings | check, look over |
| Debug | bug, error, exception, failing, failure, broken, crash, regression, stack trace, reproduce, debug, fix | slow, performance, memory, leak, hang, timeout, flaky, intermittent, wrong output, unexpected behavior | issue, problem, not working |
| Test | test, tests, testing, phpunit, pest, coverage, test suite, unit test, integration test, feature test, fixture, mock, stub, spy, tdd | assert, assertion, data provider, mutation testing, infection, test double, faker | verify, testability |
| Maintain | upgrade, migrate, migration, refactor, modernize, deprecate, deprecation, rector, php 8, compatibility | clean up, cleanup, technical debt, debt, dependency update, composer update, dead code, remove, rename, legacy | simplify, reorganize, consolidate |

**Concern signals**

| Target | Weight 3 | Weight 2 | Weight 1 |
| --- | --- | --- | --- |
| Architecture | architecture, layer, layers, boundary, boundaries, hexagonal, clean architecture, ddd, domain-driven, modular, module boundary, separation of concerns, dependency direction, god class, fat class, too many responsibilities, single responsibility | module, component, service layer, domain layer, application layer, infrastructure layer, aggregate, bounded context, anti-corruption, ports and adapters | structure, responsibility, cohesion, coupling |
| Design patterns | design pattern, strategy pattern, adapter pattern, decorator pattern, factory pattern, repository pattern, observer pattern, state pattern, builder pattern, command pattern, facade pattern, proxy pattern, composite pattern, specification pattern, unit of work, cqrs, event sourcing | pattern, strategy, adapter, decorator, factory, repository, observer, builder, state machine, gateway, provider, providers, third-party, integration, extension point, singleton, service locator | variation, variant, interchangeable, pluggable, extensible, interface, contract, port, abstraction |
| Security | vulnerability, cve, xss, csrf, sql injection, injection, authentication, authorization, auth, secret, password, encryption, crypto, sanitize, escape, owasp, secure, security | permission, role, access control, token, session, cookie, tls, https, hash, salt, nonce, rate limit, audit log | protect, safe, trust, validate input |
| Standards | psr, psr-12, psr-4, coding standard, code style, strict_types, php-cs-fixer, phpcs, php_codesniffer, lint, formatting | style, naming, convention, docblock, phpdoc, type declaration, declare(strict_types=1), readonly, enum | consistent, readability, clean code |
| Testing | phpunit, pest, coverage, test suite, unit test, integration test, feature test, fixture, mock, stub, spy, tdd | test, tests, assert, assertion, data provider, mutation testing, infection, test double, faker | verify, regression test, testability |
| Dependencies | composer, composer.json, composer.lock, autoload, psr-4, dependency, dependencies, package, vendor, version constraint, semver, platform.php | require, require-dev, lock file, outdated, audit, package update | install, update, version |
| Static analysis | phpstan, psalm, static analysis, baseline, type error, mago | analyzer, analysis, type safety, generics, phpdoc types, taint | type, level, strict |
| Debugging | xdebug, stack trace, debug, breakpoint, reproduce, trace, profiling, xhprof, blackfire, tideways | log, logging, error log, exception handler, var_dump, dd, dump, inspect, slow query | diagnose, investigate, root cause |

**File signals**

Each category counts once. File signals support classification; they never trigger a skill
without PHP context.

| File evidence | Effect |
| --- | --- |
| Any `.php` file or `composer.json` attached | PHP context `+1` |
| `tests/`, `test/`, `spec/`, or `*Test.php` | Testing concern `+2` |
| `phpunit.xml*` or `Pest.php` | Testing concern `+2` |
| `phpstan.neon*` or `psalm.xml` | Static analysis concern `+2` |
| `.php-cs-fixer.php` or `phpcs.xml*` | Standards concern `+2` |
| `rector.php` | Maintain intent `+2` |
| `deptrac.yaml` | Architecture concern `+2` |
| `src/Domain/` or `Domain/` | Architecture concern `+1` |
| `migrations/` | Architecture concern `+1` |

**PHP context**

PHP context is true when at least one of the following holds:

- the prompt contains a PHP-specific term (`php`, `composer`, `phpunit`, `pest`, `phpstan`,
  `psalm`, `php-cs-fixer`, `psr`, `laravel`, `symfony`, `wordpress`);
- a `.php` file or `composer.json` is attached;
- the active agent is one of the PHP agents.

The project profile supports scoring but does not by itself satisfy PHP context. A PHP
repository alone is not enough to trigger routing.

**Agent signals**

The active agent comes from `Session.Info.agent` returned by
`ctx.session.get({ sessionID })`. Prompt-level agent mentions are context, not a session
switch.

| Agent | Signals |
| --- | --- |
| `php-reviewer` | Review `+3`, Security `+2`, Standards `+2` |
| `php-debugger` | Debug `+3`, Testing `+2`, Debugging `+2` |
| `php-modernizer` | Maintain `+3`, Dependencies `+2`, Testing `+2` |
| `php-tester` | Test `+3`, Testing `+3`, Standards `+1` |
| `php-architect` | Design `+3`, Architecture `+3`, Patterns `+2`, Testing `+1` |
| any other agent | no agent signal |

**Profile signals**

- A detected PHP project is supporting context; it does not satisfy the PHP-context
  requirement on its own.
- When PHP context is already true, detected PHPUnit/Pest adds Testing `+1`;
  PHPStan/Psalm adds Static analysis `+1`; CS-Fixer/PHPCS adds Standards `+1`; Deptrac adds
  Architecture `+1`.
- Application vs library never adds a skill score. It changes guidance, not routing.

**Negative signals**

| Signal | Effect |
| --- | --- |
| Non-PHP language terms (javascript, typescript, python, go, rust, java, c#, ruby, node, react, vue, angular) | Do not satisfy PHP context. They do not veto an attached `.php`/`composer.json` file or an active PHP specialist agent; the PHP-context OR rule decides. |
| Framework-specific terms (laravel, symfony, wordpress, drupal, magento, cakephp, yii, slim, laminas, mezzio) | Set `frameworkContext`; do not subtract. If no generic PHP signal exists, skip routing and note the sibling toolkit. If generic signals exist, route generic skills and note the framework-specific limit. |
| `just fix`, `quick fix`, `small fix`, `typo`, `rename variable`, `one-line`, `minor change` | Architecture `-3`, Patterns `-3`, Design `-1`. |
| `no tests`, `don't add tests`, `skip tests` | Testing `-3`, Test `-2`. |
| `no refactor`, `don't refactor` | Maintain `-3`, Architecture `-2`. |
| Question form (`what is`, `how does`, `why`, `compare`, `explain`) with no actionable build/design/debug/test/maintain verb from the intent dictionaries (for example `add`, `implement`, `design`, `review`, `debug`, `test`, `upgrade`, `refactor`) | Suppress co-skills; attach only concerns scoring `>= 2`. |

**Concern gating**

Generic nouns are noisy when the task is not about design. Before thresholds are applied:

- For Test, Debug and Review intents, the Design patterns concern requires an explicit
  pattern name (`strategy`, `adapter`, `decorator`, `state`, `observer`, `builder`,
  `repository`, `factory`, `ports and adapters`, `pattern`). Generic integration nouns
  (`gateway`, `provider`, `integration`, `third-party`) do not attach pattern guidance.
- For Test, Debug and Review intents, the Architecture concern requires a weight-3
  architecture signal or an explicit architecture request. Generic weight-2/1 nouns
  (`module`, `component`, `structure`, `responsibility`) alone do not attach architecture
  guidance.
- Build, Design and Maintain keep the full dictionary, because those tasks can legitimately
  create or reshape structure.
- Gating removes the concern before threshold checks and before budget selection; the drop
  reason is recorded as `gate:non-design-intent`.

### 7.3 Deterministic classification, thresholds and conflict resolution

The classifier returns at most two intents and three concerns before the budget is applied.

```
classify(prompt, files, agent, profile, state):
  if not phpContext: return empty
  scores = score(prompt, files, agent, profile)
  intents = targets with score >= 3

  hasUpgradeSignal = any of upgrade, migrate, modernize, deprecation, rector, php 8
  maintainSubtype = subtype(scores)
  # Apply conflicts before truncation so a third intent cannot hide a suppression.
  if "Debug" in intents and score("Design") < 5: remove "Design"
  if "Maintain" in intents and hasUpgradeSignal and score("Debug") < 5:
    remove "Debug"
  if "Review" in intents and score("Build") < 5: remove "Build"

  intents.sort(score desc, intentPriority, catalogOrder)
  intents = intents.take(2)

  concerns = targets with score >= 2
  concerns.sort(score desc, concernPriority, catalogOrder)
  concerns = concerns.take(3)
  if score("Security") >= 3 and "Security" not in concerns:
    if len(concerns) < 3: append "Security"
    else: replace the lowest-scoring non-explicit concern with "Security"

  if intents is empty and agent is a PHP specialist:
    # Defensive: agent signals normally prevent this branch.
    intents = agentDefaults(agent)

  return intents, concerns, scores, maintainSubtype
```

`agentDefaults` is fixed: `php-reviewer` → Review, `php-debugger` → Debug,
`php-modernizer` → Maintain, `php-tester` → Test, `php-architect` → Design. No other agent
has defaults.

`subtype(scores)` is fixed for Maintain:

| Subtype | Strongest matched signal group | Co-skills |
| --- | --- | --- |
| `modernization` | upgrade, migrate, deprecation, rector, php 8, compatibility, legacy | `php-modernize` + `php-composer` |
| `dependency` | dependency update, composer update, package update, outdated, lock file | `php-composer`; `php-testing` only when Testing `>= 2` |
| `refactor` | refactor, clean up, technical debt, dead code, rename, simplify, reorganize, consolidate | `php-architecture`; patterns only when Patterns `>= 2`; testing only when Testing `>= 2` |

If more than one group matches, the group with the highest summed weight wins. Ties resolve
in the order `modernization > dependency > refactor`. A Maintain intent without a subtype
defaults to `refactor` and never attaches `php-composer` on its own.

Fixed priority orders:

- Intent: `Debug > Review > Test > Maintain > Design > Build`.
- Concern: `Security > Testing > Debugging > Static analysis > Architecture >
  Design patterns > Standards > Dependencies`.

Thresholds and confidence:

| Target | Threshold | Confidence |
| --- | --- | --- |
| Intent | `>= 3` | high at `>= 5`, medium at `3–4` |
| Concern | `>= 2` | high at `>= 5`, medium at `3–4`, low at `2` |
| Security concern | `>= 2`; forced into the top three at `>= 3` unless explicitly requested | high at `>= 5` |

- If no intent reaches `3`, attach only concern skills scoring `>= 2`, without co-skills. Do
  not guess.
- A PHP repository alone is not enough; PHP context must come from a PHP-specific prompt
  term, an attached `.php`/`composer.json` file, or an active PHP agent. The profile supports
  scoring but does not satisfy PHP context by itself. An active PHP specialist agent is an
  explicit user choice and supplies PHP context even when the prompt names another language;
  there is no separate non-PHP language veto.
- Scores, framework hints and dropped reasons are recorded as stable codes. Framework hints
  use `framework:<name>` diagnostics and a short state-part note; they never satisfy PHP
  context on their own. Raw prompt text is never stored.

**Worked examples**

The examples assume PHP context from an attached `.php` file or an active PHP agent.

| Prompt | Intents | Concerns | Selected skills |
| --- | --- | --- | --- |
| "Add a new payment gateway." | Build `3` | Patterns `2` | `php-design-patterns`, `php-testing` (feature-scale Build co-skill) |
| "Add multiple payment providers with proper test coverage and security." | Build `3`, Test `6` | Patterns `2`, Testing `5`, Security `3` | `php-testing`, `php-design-patterns`, `php-security` |
| "Fix the slow query in the user payment feature." | Debug `5` | Debugging `2`, Testing `0` | `php-debug` only; Build is absent and Testing is below threshold |
| "Review this PR for security issues." | Review `3` | Security `3`, Standards `0` | `php-standards`, `php-security` |
| "Review the diff for PSR-12 violations." | Review `5` | Standards `3` | `php-standards` only; this is not a broad review, so no security co-skill |
| "Upgrade to PHP 8.3 and fix deprecations." | Maintain `6` | Dependencies `0`, Testing `0` | `php-modernize`, `php-composer` (Maintain modernization co-skills) |
| "Upgrade to PHP 8.3, fix deprecations, and add tests." | Maintain `6`, Test `3` | Testing `2` | `php-modernize`, `php-composer`, `php-testing`; Debug is removed before truncation, so Test is not lost |
| "Refactor the payment module to use the Strategy pattern." | Maintain `3` | Patterns `3`, Architecture `2` | `php-architecture`, `php-pattern-strategy`; Maintain refactor does not attach Composer |
| "Add a decorator around the payment gateway." | Build `3` | Patterns `4` | `php-pattern-decorator`, `php-testing` |
| "Write a test for the payment gateway." | Test `3` | Testing `2` | `php-testing`; the generic gateway noun does not trigger pattern guidance |
| "What is the difference between Strategy and Adapter?" | none | Patterns `4` | `php-design-patterns`; comparison questions use the index |
| "Explain the Strategy pattern." | none | Patterns `3` | `php-pattern-strategy`; one named promoted pattern |
| "Can you fix this?" | Debug `3` | Debugging `0` | `php-debug`; no testing co-skill |
| "Add an email validation method to this class." | Build `3` | none | none beyond L0; no architecture or pattern skill |

The last two rows are deliberate: low-confidence or small, local changes must not attract
architecture and pattern guidance.

### 7.4 Task boundaries, continuation and reset

Session state uses a monotonically increasing `taskGeneration`. `lastPromptAt` alone never
decides whether a task is still active.

| Prompt condition | State behavior |
| --- | --- |
| Unambiguous follow-up: continuation marker (`also`, `now`, `then`, `that`, `it`, `this`, `same`, `fix that`, `why`, `continue`, `next`) and no new strong intent | Inherit the active task generation, intents and concerns. |
| Short prompt (`<= 12` tokens) with no new intent and the same attached files or active agent | Treat as a continuation; inherit task and concerns. |
| Explicit additional concern ("now make it secure", "add tests") | Add the concern to the current task generation. |
| New strong intent (`>= 3`) with an unrelated subject, no continuation marker | Start a new task generation; recompute intents and concerns from the current prompt. Do not carry prior concerns. |
| Explicit task switch (`new task`, `unrelated`, `switch to`, `different problem`) | Reset task state and recompute. |
| Ambiguous continuation: short follow-up with a new concern signal but no strong intent | Inherit the active intent, but recompute concerns from the current prompt. Carry forward only a concern the prompt explicitly references. |

Rules:

- Concerns are merged only for a confirmed continuation. A new task recomputes them, so
  concerns cannot accumulate across unrelated work.
- A continuation inherits the active `maintainSubtype` when the current prompt does not name
  a new Maintain subtype. A new task recomputes the subtype from the current prompt. This
  keeps a bare follow-up such as `also add tests` on the active modernization/dependency/
  refactor path instead of falling back to `refactor`.
- The previous task is retained as `previousTask` for one turn only, for reference; it never
  contributes skills.
- If state is lost, reconstruct the active task from `php-toolkit.mode` or the last user
  message. Reconstruction is conservative: no concerns are inherited.
- A task generation older than `30 minutes` with no continuation is treated as a new task.
  This is a safety valve, not the primary boundary rule.

### 7.5 Selection and budget

Default budget:

- `maxSkills`: 3.
- `maxSkillChars`: 12,000. Configurable up to 16,000; larger values are clamped.
- Hard ceiling: 4 skills / 16,000 chars, reached only when the user explicitly selects
  skills or a high-confidence security concern needs the fourth slot or replaces a
  lower-priority skill.

Selection order:

1. Explicit skills.
2. Co-skills implied by the intent, subtype and confidence:
   - Design → `php-architecture` + the pattern skill chosen by the pattern-selection rules
     (the index by default).
   - Build → `php-testing` only when Testing `>= 2` or the prompt is feature-scale
     (`new feature`, `endpoint`, `service`, `module`, `integration`, `multiple`,
     `providers`, `gateway`, `workflow`); patterns only when Patterns `>= 2`.
   - Review → `php-standards` always; `php-security` when Security `>= 2` or the prompt is a
     broad review (`code review`, `pr review`, `pull request review`, `review this pr`,
     `review the pr`, `audit`).
   - Debug → `php-debug`; `php-testing` only when Testing `>= 2`.
   - Test → `php-testing`.
   - Maintain `modernization` → `php-modernize` + `php-composer`.
   - Maintain `dependency` → `php-composer`; `php-testing` only when Testing `>= 2`.
   - Maintain `refactor` → `php-architecture`; patterns only when Patterns `>= 2`; testing
     only when Testing `>= 2`.
3. Concern skills that passed the threshold, in concern-priority order.
4. Agent defaults when no intent passed the threshold (defensive; agent signals normally
   supply an intent).
5. Fill the remaining budget by score.

Pattern-skill selection:

- Patterns `>= 2` is required before a pattern skill is attached, except for the Design
  intent, where `php-design-patterns` is a required co-skill even when the pattern score is
  below `2`.
- Record the set of **promoted specific pattern names** matched in the prompt
  (`strategy`, `adapter`, `decorator`, `state`; later observer, builder, factory-method,
  repository, ports-adapters). Generic `pattern` does not count as a specific name.
- No promoted specific name → `php-design-patterns` (the problem-first index).
- Exactly one promoted specific name → that core pattern skill.
- Two or more promoted specific names in a task with Build, Design, Review or Maintain
  intent → up to two core pattern skills, highest-scoring first, subject to budget.
- Two or more promoted specific names in a knowledge question or comparison → the index,
  because comparing patterns is the index's job.
- A P1 pattern name that is not promoted yet → the index plus a reference pointer.
- References are read on demand and never count against the attachment budget.

Tie-breaking is fixed and deterministic:

1. Explicit selection.
2. Co-skill.
3. Higher target score.
4. Concern priority (`Security > Testing > Debugging > Static analysis > Architecture >
   Design patterns > Standards > Dependencies`).
5. Catalog order.

Rules:

- Never attach a skill already **activated** in this session.
- A selected or attached skill that has not activated may be re-attached on the next prompt.
  Within one prompt, attach each skill at most once.
- A router-selected skill whose effective permission is `deny` is not attached. Record
  `permission:denied`.
- A router-selected skill whose effective permission is `ask` is attached once; the host
  performs the approval. Record `permission:awaiting-approval` until activation.
- After two attachment attempts in the same task generation without activation, suppress the
  skill for that task generation and record `activation:not-confirmed`. Try again on a new
  task or after a permissions change.
- Drop the lowest-priority non-explicit skill when over budget; record the drop reason.
- A high-confidence Security concern (`>= 5`) may use the fourth slot or replace the
  lowest-priority non-explicit, non-co-skill selection. Record `security:hard-ceiling`; when
  a skill is replaced, record `budget:security-replacement`. Explicit skills and intent
  co-skills outrank the security exception.
- Pattern skills count as one skill each; their reference files are read on demand and are not
  part of the attachment budget.
- The selector returns reasons as stable codes (`intent:build`, `concern:security`,
  `file:.php`, `agent:php-architect`, `framework:laravel`, `explicit:@php-testing`,
  `security:hard-ceiling`), never raw prompt text.

### 7.6 Explicit skills and permissions

- `event.prompt.skills` is an array of `{ id, mention? }` attachments; merge, do not replace.
- Preserve existing mention offsets.
- Never remove a user-selected skill.
- New attachments are pushed as `{ id }` without a mention, so the user's text is never
  rewritten.
- Explicit `@skill-id` selections bypass the soft budget and are never removed by the
  router. If they exceed the hard ceiling, keep every explicit skill and record
  `budget:explicit-overflow`; never drop a user-selected skill. The host still enforces
  permissions: a denied explicit skill remains in the prompt but is recorded as `denied`.
- Skill permissions are enforced by OpenCode's normal resolution path. The plugin never
  bypasses an `ask` or `deny` policy.
- Attachment is not proof of loading. Only `session.skill.activated` proves that a skill was
  resolved and loaded.
- The plugin classifies attached-but-unactivated skills using the session's effective
  permission snapshot
  (`Session.Info.permissions` and `session.permissions` events) when it can interpret the
  `skill` action/resource shape:
  - `deny` → `denied`; do not re-attach until a `session.permissions` event changes the rule.
  - `ask` → `awaiting-approval`; the host owns the prompt.
  - `allow` or no matching rule → `pending`.
  If the shape cannot be interpreted, use `pending` and rely on activation. Never infer
  denial from the absence of an activation event alone.

### 7.7 Skill-loading lifecycle

On prompt:

1. Resolve the session's `location.directory` and `subpath`; refresh the profile if either
   fingerprint changed.
2. Determine the task boundary (continuation, new task or reset) and update
   `taskGeneration`.
3. Classify intent and concerns.
4. Select skills and merge explicit selections.
5. Subtract skills already activated in this session, router-selected skills currently
   `denied`, and skills currently `awaiting-approval` (the host owns the pending decision).
   Explicit `@skill-id` selections are never removed; they stay in the prompt even when the
   effective permission is `deny`.
6. Attach new router-selected skills through `event.prompt.skills`; record each selected
   skill as `pending`, `awaiting-approval` or `denied` based on the effective permission
   snapshot. A denied router-selected skill is recorded but not attached.
7. Update in-memory session state and persist it best-effort to `ctx.storage`. The context
   hook renders the model-facing view on the next model request.
8. Record metrics.
9. Do not announce by default; diagnostics go to `/php-toolkit-status` and the local log.

On context:

1. Remove any system part previously added by this plugin (identified by
   `metadata["php-toolkit"].kind`).
2. Append the stable L0 constitution as a system part.
3. Append one compact state system part containing the project profile, active task
   generation, intents/concerns, selected/attached/activated skills, pending skills, the
   framework-specific limit note when the profile names a framework, and the verification
   reminder when applicable.
4. Do not append duplicates when the hook runs again for the same request.

On skill activation:

1. Subscribe to `session.skill.activated`.
2. Match `data.sessionID` and `data.id`; add the skill to `activatedSkills`.
3. Update the in-memory state, persist it, and record a metrics activation. The next context
   render reflects the activation.
4. Ignore activation events for other sessions.

On permissions change:

1. Subscribe to `session.permissions`.
2. For the matching session, re-evaluate `denied` and `awaiting-approval` skills.
3. Apply the new rule: `denied` becomes `pending` when no longer denied;
   `awaiting-approval` becomes `pending` on `allow`, or `denied` on `deny`. Clear the
   two-attempt suppression for `activation:not-confirmed` skills so they can be retried.
   Activation remains the only proof of loading.
4. Do not attach anything from the permissions event itself; routing still happens on the
   next prompt.

On compaction:

- Compaction is a separate `session.hook("compaction")`, not a `kind` on the context hook.
- The hook is a no-op by default. It never injects task state into the summary prompt and
  never rewrites the summary result.
- The state system part is not part of the compaction request. After compaction, the next
  primary context render re-injects the current state from memory or storage.
- After compaction the next prompt re-attaches any `pending` skill that never activated;
  `awaiting-approval` and `denied` skills follow their permission rules.
- If session state is lost after a plugin restart, hydrate from `ctx.storage`; if that is
  unavailable, reconstruct the active task from the last user message returned by
  `ctx.session.context({ sessionID })`. Reconstruction does not inherit concerns.

On title and generate requests:

- These hooks are no-ops. Routing state is not injected into titles or transient
  generations.

Failure handling:

- A router failure must never break prompt admission. Log, attach nothing and continue.
- A missing skill file is skipped; the catalog test should catch it at build time.
- A storage failure is logged; routing still works from memory and the next context render
  re-creates the model-facing state.
- A `session.skill.activated` subscription failure is logged; the plugin falls back to
  treating attached skills as unactivated and re-attaches them on the next prompt without
  counting a failed activation attempt. Activation remains the only proof.

### 7.8 Session state model

```ts
type VerificationStatus =
  | "passed"
  | "failed"
  | "partial"
  | "unavailable"
  | "error";

type MaintainSubtype = "modernization" | "dependency" | "refactor";

interface SessionRoutingState {
  sessionID: string;
  projectRoot: string;
  projectSubpath: string | null;
  projectFingerprint: string;
  projectLockFingerprint: string | null;
  taskGeneration: number;
  taskStartedAt: number;
  previousTask: {
    generation: number;
    intents: Intent[];
    concerns: Concern[];
  } | null;
  activeIntents: Intent[];
  activeConcerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  selectedSkills: string[];
  attachedSkills: string[];
  activatedSkills: Set<string>;
  unactivatedSkills: Array<{
    id: string;
    attempts: number;
    status: "pending" | "awaiting-approval" | "denied";
    reason: string;
  }>;
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
```

Skill state is explicit:

| State | Meaning |
| --- | --- |
| `selected` | The router or the user chose the skill. |
| `attached` | The skill ID was added to `event.prompt.skills`. |
| `activated` | `session.skill.activated` confirmed resolution and loading. |
| `pending` | Attached but not activated; no permission decision is known yet. |
| `awaiting-approval` | The effective permission is `ask`; the host owns the prompt. |
| `denied` | The effective permission is `deny`; do not re-attach until permissions change. |

Only `activated` suppresses future attachment for the task. `denied` suppresses until a
permissions change. `pending` may be retried, subject to the two-attempt rule.
`awaiting-approval` is retried only after the host resolves the permission.

State lives in an in-memory `Map<sessionID, SessionRoutingState>`. The in-memory copy is
authoritative during a plugin lifetime. It is persisted best-effort to
`ctx.storage` under `php-toolkit:session:<sessionID>` with a schema version, and rendered
into the model-facing state system part by the context hook. Persistence and rendering never
store prompt text, code or file contents. The map is keyed by session ID, and each entry
carries its own project root so worktrees and multiple repositories never share routing
state.

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
- **Core pattern skills** — hidden (`autoinvoke: false`) specialized skills, promoted in
  stages rather than authoring nine independent skills at once:
  - **P0 promoted** (clear, distinct engineering concerns):
    - `php-pattern-strategy`
    - `php-pattern-adapter`
    - `php-pattern-decorator`
    - `php-pattern-state`
  - **P1 promoted** after the index and references prove useful:
    - `php-pattern-observer`
    - `php-pattern-builder`
    - `php-pattern-factory-method`
    - `php-pattern-repository`
    - `php-pattern-ports-adapters`

  A pattern becomes an independently attachable skill only when it has a demonstrable
  benefit over the index plus a reference. Repository is deliberately late: it is frequently
  introduced unnecessarily in PHP applications and needs a strong "when not to use" section.
  The router attaches a core pattern skill when exactly one promoted pattern is named, and
  allows a second only when two distinct promoted patterns are named in a task and the
  budget permits (Section 7.5). Comparisons and unnamed pattern work use the
  `php-design-patterns` index. The rest remain available through the index and references.
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
- `architectureMode: "off"` — no architecture mode and classifier design gating is disabled;
  routing and skill attachment continue.

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

Namespace: `php`. The tool is **non-mutating with respect to source code, dependency
manifests and project configuration**. It never installs dependencies, edits configuration or
applies fixes. It is not side-effect free: tests and static analysis execute project-defined
code, which may write files, touch a database, call a service or mutate a shared environment.
It therefore respects the host's execution permission model and never bypasses an `ask` or
`deny` policy. When the host exposes only tool-level permissions, that decision is the
boundary; the report states `permission:tool-level-only` rather than implying per-command
approval.

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

`directory` defaults to the session root resolved from `context.sessionID`. Relative `paths`
resolve against that directory; paths outside the resolved root are rejected. If `checks` is
omitted, run every detected check. If `paths` is provided, it overrides the changed-file set
for `lint`, `static` and `style`, regardless of `scope`. Tests still use changed-file mapping
for `scope: "changed"`; `scope: "all"` runs the full suite.

Checks and changed-scope behavior:

| Check | Detection | `scope: changed` behavior | `scope: all` behavior |
| --- | --- | --- | --- |
| `lint` | Always | `php -l` on changed or provided PHP files; deleted files skipped; cap file count. | `php -l` on source/test roots; cap file count. |
| `composer` | `composer.json` present | Validate `composer.json` globally; never path-scoped. | Same. |
| `tests` | PHPUnit/Pest config or dev dependency | Changed test files directly; changed source files mapped to affected tests; if mapping is unreliable or a source file was deleted, run the full suite with `tests:full-suite-fallback`. Never pass production source paths as test paths. | Full suite. |
| `static` | PHPStan/Psalm config or dev dependency | Changed source paths where the analyzer supports path arguments; otherwise full analysis. | Full analysis. |
| `style` | CS-Fixer/PHPCS config or dev dependency | Changed PHP files; CS-Fixer `--dry-run --diff --using-cache=no`; PHPCS read-only. | Source/test roots. |
| `architecture` | `php-toolkit.json` layers or Deptrac config | Deptrac analysis when configured. The scanner adapter arrives in Phase 5; until then, configured `php-toolkit.json` boundaries report `skipped: scanner-unavailable`. | Same. |

**Scope semantics**

`scope: changed` is derived from the host VCS API, not a private Git parser. The tool
resolves the session root from `context.sessionID` and calls the plugin-scoped
`ctx.vcs.status`:

1. Call `ctx.vcs.status({ location: { directory } })`; the result is
   `{ location, data: VcsFileStatus[] }`.
2. Include every working-tree entry: staged, unstaged and untracked changes. The API reports
   `added`, `modified` and `deleted`; it does not expose a staged/unstaged split, and the
   report must not claim one.
3. Include `added` and `modified` files; record `deleted` files separately.
4. Treat renames as the new path.
5. If the project is not a VCS repository or `vcs.status` fails, `changed` scope is
   `unavailable`; the report says so and suggests `scope: "all"`. It never returns `passed`
   merely because the changed list could not be determined.
6. If the VCS confirms an empty changed list, checks that operate on changed files are
   `skipped: no-changed-files`; the aggregate is `partial`, not `passed`.

`paths` overrides the changed-file set for `lint`, `static` and `style`. Tests still use
test mapping; a production path is never passed to the test runner.

**Changed-file test selection**

For each changed production file under a source root:

1. Replace the matching source root with the project's test root and append `Test.php`.
2. Search the test roots for `{ClassName}Test.php`.
3. Apply project conventions discovered in the profile (`tests/Unit/`, `tests/Feature/`,
   `tests/Integration/`).
4. Union the candidates with any directly changed test files.
5. If candidates exist, pass only those test files to the runner.
6. If no candidate exists, or a source file was deleted, run the full suite and label the
   check `tests:full-suite-fallback`.
7. Never claim targeted coverage when the mapping was heuristic; the report states which
   mode was used.

**Per-check and aggregate status**

Per-check status:

| Status | Meaning |
| --- | --- |
| `passed` | Executed successfully with no findings. |
| `failed` | Executed and found a failure. |
| `warning` | Executed and found a non-blocking issue. |
| `skipped` | Intentionally not executed, with a reason code. |
| `unavailable` | Required tool or configuration is missing. |
| `timed_out` | Exceeded the per-check timeout. |
| `cancelled` | Interrupted by `AbortSignal` or the user. |

Aggregate status, computed deterministically:

1. `error` when the tool could not produce a report at all.
2. `failed` when any check is `failed`.
3. `passed` only when every requested check is `passed`.
4. `unavailable` when every requested check is `unavailable`.
5. `partial` otherwise, including warning, skipped, timed-out, cancelled and mixed results.

This ordering makes an empty changed-file set `partial` (checks were skipped), not
`unavailable` or `passed`, while a project with no runnable tooling is `unavailable`.

Rules:

- Detect what the project has; skip unavailable checks with a clear reason.
- Do not install tools.
- Do not modify configuration to make a check pass.
- Do not silently ignore existing failures.
- Do not run network checks (`audit`, `outdated`) unless explicitly requested; they remain
  separate tools.
- Cap output at 24,000 characters.
- Respect `AbortSignal` and per-check timeouts.
- Return a report even when individual checks fail.
- The tool inherits the host's execution permissions. If the host requires approval to run a
  test command, the tool requests it through the normal path; it never spawns around the
  permission system.

Output shape:

```
PHP verification (scope: changed)
✅ lint       3 files, 0 errors
✅ composer   valid
⚠️ tests      12 passed (targeted: 2 changed tests + 1 mapped test)
❌ static     2 errors (PHPStan level 6)
⏭️ style      php-cs-fixer not installed
⏭️ architecture scanner-unavailable (configured boundaries; Phase 5 adapter pending)

Summary: failed — 2 passed, 1 failed, 1 warning, 2 skipped.
Next: fix the PHPStan errors, then rerun php_verify.
```

### 10.2 Completion workflow

For Build, Design and Test intents, the model-facing state system part includes:

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
`filter` input is insufficient for changed-file scope, `php_verify` passes test paths to the
runner directly rather than changing the existing tool's public input. Metrics record
verification runs, normalized statuses, pass/fail/skipped counts and findings.

**Execution adapter.** The existing `run` helper uses `execFile` directly. To make
`php_verify` permission-aware without changing public tool inputs:

- Extract a `CommandRunner` interface: `run(cmd, args, cwd, timeoutMs, signal, authorize?)`.
- Keep `execFile` as the default runner so existing tools behave exactly as today.
- `php_lint`, `composerValidate`, `php_static_analysis` and `php_test` accept an optional
  runner parameter used only by `php_verify`.
- `php_verify` passes a runner that checks the session's command/shell permission rules
  before spawning. `deny` → the check is `cancelled` with `permission:denied`; `ask` without
  an already-granted decision → `cancelled` with `permission:approval-required`; the tool
  does not spawn around the policy.
- If the host exposes no command-level rules, the runner records
  `permission:tool-level-only` and proceeds only when the `php_verify` tool call itself was
  allowed.

This keeps parsing and report logic shared while making the execution boundary explicit.

**Phase dependency:** Phase 3 ships `php_verify` with Deptrac support only when a Deptrac
config exists. It does not depend on the Phase 5 scanner. If `php-toolkit.json` declares
boundaries but the scanner is not installed, the architecture check reports
`skipped: scanner-unavailable`. Phase 5 adds the scanner adapter without changing the report
contract.

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

- Cache key: scanner version + toolkit version + project fingerprint + configuration
  fingerprint + file-content fingerprint.
- File-content fingerprint: sorted `path\0size\0mtimeMs\0sha256(content)` for files up to
  `1 MB`. For larger files, use `path\0size\0mtimeMs` and mark the entry
  `cacheMode: "metadata"` so the result is explicitly best-effort.
- `composer.lock` content is part of the project fingerprint; a lock change invalidates the
  profile and scanner cache even when `composer.json` is unchanged.
- In-memory cache plus optional `ctx.storage` cache for cross-session reuse.
- Invalidate on file changes, config changes, lock changes or toolkit upgrade.
- A cache hit must never cross project roots or worktrees; the resolved root and subpath are
  part of the key.

### 11.6 Modes and privacy

- `architectureScan: "tool"` (default) — on-demand only. This is the least-friction
  default.
- `architectureScan: "auto"` — run for high-confidence Design tasks, cached, with a 2-second
  budget. If the budget is exceeded, skip and leave the tool available. The summary is
  injected into the model-facing state system part; full details require the tool.
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
- Four P0 hidden core pattern skills: `php-pattern-strategy`, `php-pattern-adapter`,
  `php-pattern-decorator`, `php-pattern-state` (Section 8.2).
- Five P1 hidden core pattern skills: observer, builder, factory-method, repository,
  ports-adapters.

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
- `/php-toolkit-status` — diagnostics: profile and type confidence, active task
  generation, intent/concerns, selected/attached/activated skills, reasons, config, last
  verification, last scan.

### Tools

Existing on `main` (merged via PR #4):

`php_project_detect`, `php_lint`, `php_composer_audit`, `php_composer_outdated`,
`php_static_analysis`, `php_test`, `php_metrics`.

New:

- `php_verify` — orchestrates the available checks and returns one report.
- `php_architecture_scan` — read-only architecture scanner (Phase 5).

No existing tool is removed or renamed. `php_verify` reuses the underlying check functions
so test/static-analysis parsing and finding counts stay in one place.

### Hooks

- `session.hook("prompt")` — task boundary, routing and skill attachment.
- `session.hook("context")` — replace the plugin's system parts, then push L0 and the state
  part for agent-loop requests, including tool continuations.
- `session.hook("compaction")` — separate hook; no-op by default. Never injects task state
  into the summary.
- `session.hook("title")` and `session.hook("generate")` — no-ops; routing state is not
  injected into titles or transient generations.
- `ctx.event.subscribe()` for `session.skill.activated` — confirms which attached skills
  actually loaded.
- `ctx.event.subscribe()` for `session.permissions` — re-evaluates denied and
  awaiting-approval skills when the session permission snapshot changes.
- `tool.hook("execute.before")` — existing destructive-pattern warning.
- `tool.hook("execute.after")` — optional metrics for verification runs; no user-facing
  noise.

### Announcements

- Model-facing: the context hook's state system part, replaced only when the selection or
  task generation changes.
- User-facing P0: **silent by default**. Routing decisions are logged locally and exposed
  through `/php-toolkit-status`. No synthetic messages, no prompt rewriting, no extra model
  turns.
- `announceSelections: "off"` is the P0 default. `"on-change"` and `"always"` remain
  available for hosts that expose a non-turn-triggering notification surface; they are not
  used to inject session input.
- A future TUI notification component can consume the same routing event without changing
  the router contract.

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
        "announceSelections": "off",
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
| `maxSkillChars` | integer 1–16000 | `12000` | Soft character budget for attached skill content; values above 16,000 are clamped. |
| `architectureMode` | `risk` \| `strict` \| `off` | `risk` | Risk-based, always-approval, or disabled. |
| `architectureScan` | `tool` \| `auto` \| `off` | `tool` | On-demand, auto for strong design intent, or disabled. |
| `announceSelections` | `on-change` \| `always` \| `off` | `off` | Visibility of routing decisions. P0 is silent; diagnostics live in `/php-toolkit-status`. |
| `verification` | `remind` \| `off` | `remind` | Include the completion checklist for Build/Design/Test. |

`architectureScan`, `announceSelections` and `verification` are reserved until their
respective phases ship; Phase 1 parses these options but gives them no behavior.
Routing is silent by default, and the escape hatches become effective when the
corresponding layer lands.

Project-local `php-toolkit.json` (optional) supports architecture boundaries and routing
overrides as described in Section 11.3. Project-local routing overrides take precedence over
global plugin options for that project; architecture boundaries are project-local only.
Invalid values fall back to defaults with a clear console warning; the plugin never fails to
load because of bad options.

The plugin does not have a global `projectRoot` option. The root is always resolved from the
session's `location.directory` and `subpath` (Section 5), so a global install works across
repositories and worktrees.

Escape hatches:

- `autoSkills: "off"` restores the old passive behavior. The L0 constitution remains.
- `autoSkills: "hint"` classifies and records recommended skills in `php-toolkit.skills`
  with `mode: "hint"`, but does not modify `event.prompt.skills`. The model may load them
  explicitly.
- `architectureMode: "off"` disables classifier design gating; routing and skill attachment
  continue.
- `architectureScan: "off"` disables the scanner once it ships; Phase 1 does not register one.
- `verification: "off"` removes the completion reminder once shipped; the tool remains
  available.

## 14. Metrics and observability

Extend the local metrics document to version 3. Migration from v2 adds empty sections.

New counters:

```ts
interface RoutingMetrics {
  selections: Record<string, { count: number; lastUsedAt: string }>;
  activations: Record<string, { count: number; lastUsedAt: string }>;
  unactivated: Record<string, number>;
  intents: Record<string, number>;
  concerns: Record<string, number>;
  dropped: Record<string, number>;
  taskGenerations: number;
  continuations: number;
  /** Explicit task switches (`new task`, `unrelated`, `switch to`, `different problem`). */
  resets: number;
}

interface VerificationMetrics {
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

interface ScannerMetrics {
  runs: number;
  findings: number;
  hypotheses: number;
  truncated: number;
  cacheHits: number;
  cacheModes: { content: number; metadata: number };
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
  Project: my-app (application, high confidence, PHP 8.2, PHPUnit + PHPStan)
  Root:    /repo/my-app (subpath: none)
  Task:    generation 3 (continuation)
  Active:  build + design | concerns: architecture, patterns, testing
  Selected: php-architecture, php-design-patterns, php-testing
  Attached: php-architecture, php-design-patterns, php-testing
  Activated: php-testing
  Pending:  php-design-patterns (attached, not activated)
  Dropped:  php-security (budget)
  Mode:     risk | scan: tool | announce: off
  Verify:   last run 2026-11-04 09:12Z — failed (2 passed, 1 failed, 2 skipped)
```

## 15. Testing and evaluation

### Unit tests

- Classifier corpus: representative prompts with expected intents, concerns and the full
  expected selected-skill set. Labels alone are insufficient.
- Deterministic scoring: repeated keywords count once, phrases consume tokens, per-target cap
  is enforced, tie-breaks match the fixed priority order.
- Budget: max skills, max chars, explicit bypass, dropped reasons, two-pattern-skill case.
- Pattern selection: index vs core skill, one named pattern, two named patterns in a task,
  comparison questions, P1 fallback.
- Negative cases: non-PHP prompt, framework-specific prompt, ambiguous "fix this", small
  local change, question form.
- Task boundaries: continuation inheritance, explicit concern addition, unrelated new task
  recomputes concerns, explicit reset, ambiguous continuation, 30-minute safety valve.
- Agent and file signals.
- Project profile detection: application, library, unknown, missing Composer `type`,
  explicit `type: project`, explicit `type: library`, conflicting layout evidence, no
  Composer, framework hint, tool detection, lock-file change.
- Catalog integrity: every skill ID has a catalog entry and a markdown file; every pattern
  reference has the required sections.

### Routing corpus

Every case asserts the full expected selected-skill set, not just intent/concern labels.
Skill sets are unordered; `none` means L0 only. Unless noted, each case has PHP context from
an attached `.php` file.

| ID | Prompt | Expected selected skills |
| --- | --- | --- |
| R01 | Add a new payment gateway. | `php-design-patterns`, `php-testing` |
| R02 | Add multiple payment providers with proper test coverage and security. | `php-testing`, `php-design-patterns`, `php-security` |
| R03 | Fix the slow query in the user payment feature. | `php-debug` |
| R04 | Review this PR for security issues. | `php-standards`, `php-security` |
| R05 | Review the diff for PSR-12 violations. | `php-standards` |
| R06 | Review this PR. | `php-standards`, `php-security` |
| R07 | Review the diff. | `php-standards` |
| R08 | Upgrade to PHP 8.3 and fix deprecations. | `php-modernize`, `php-composer` |
| R09 | Upgrade to PHP 8.3, fix deprecations, and add tests. | `php-modernize`, `php-composer`, `php-testing` |
| R10 | Refactor the payment module to use the Strategy pattern. | `php-architecture`, `php-pattern-strategy` |
| R11 | Add a decorator around the payment gateway. | `php-pattern-decorator`, `php-testing` |
| R12 | Write a test for the payment gateway. | `php-testing` |
| R13 | What is the difference between Strategy and Adapter? | `php-design-patterns` |
| R14 | Explain the Strategy pattern. | `php-pattern-strategy` |
| R15 | Can you fix this? | `php-debug` |
| R16 | Add an email validation method to this class. | `none` |
| R17 | Make the checkout flow secure. | `php-security` |
| R18 | Add authentication to the admin panel. | `php-security` |
| R19 | Add a repository for the Order aggregate. | `php-design-patterns`, `php-architecture` |
| R20 | Introduce an extension point for export formats. | `php-architecture`, `php-design-patterns` |
| R21 | Decouple the domain from the infrastructure. | `php-architecture`, `php-design-patterns` |
| R22 | Fix the security vulnerability in the login form. | `php-debug`, `php-security` |
| R23 | Run PHPStan and fix the type errors. | `php-debug`, `php-static-analysis` |
| R24 | This class has too many responsibilities; split it. | `php-architecture` |
| R25 | Add a new endpoint. | `php-testing` |
| R26 | Add an endpoint with PHPStan level 9. | `php-testing`, `php-static-analysis` |
| R27 | Add a cache layer with Redis. | `php-architecture` |
| R28 | Add a cache to the report generator. | `none` |
| R29 | The invoice test is flaky and fails intermittently. | `php-debug`, `php-testing` |
| R30 | Add tests for the invoice calculator. | `php-testing` |
| R31 | Migrate the legacy billing module to a new namespace. | `php-modernize`, `php-composer`, `php-architecture` |
| R32 | Add a data provider for the invoice tests. | `php-testing` |
| R33 | Add a Stripe integration service. | `php-design-patterns`, `php-testing` |
| R34 | Add a factory for creating invoices. | `php-design-patterns` |
| R35 | Refactor the switch statement into a state machine. | `php-architecture`, `php-pattern-state` |
| R36 | Add an adapter for the legacy payment API. | `php-pattern-adapter` |
| R37 | Modernize the legacy billing code. | `php-modernize`, `php-composer` |
| R38 | Add a singleton for the database connection. | `php-design-patterns` |
| R39 | Refactor this 500-line controller. | `php-architecture` |
| R40 | Add a new feature flag service. | `php-testing` |
| R41 | Add CSRF protection to the signup form. | `php-security` |
| R42 | Add an interface for the payment gateway. | `php-testing`, `php-design-patterns` |
| R43 | Refactor this TypeScript component. No PHP file or agent. | `none` (no PHP context) |
| R44 | Add a Laravel controller with tests and security. Framework term present. | `php-testing`, `php-security` (generic skills; framework-specific limit noted) |
| R45 | Fix this. No PHP file or agent. | `none` (no PHP context) |
| R46 | Add a method to the class. Active agent: `php-tester`. | `php-testing` |
| R47 | Review this PR for security issues. Active agent: `php-reviewer`. | `php-standards`, `php-security` |
| R48 | Fix the slow query. Active agent: `php-debugger`. | `php-debug`, `php-testing` |
| R49 | Add a new service. Active agent: `php-architect`. | `php-architecture`, `php-design-patterns`, `php-testing` |

The corpus is a minimum contract. New signal entries or selection rules must add or update a
case; a rule without a case is not accepted.

### Integration tests

- Prompt hook with a fake event: selected skills are added, existing skills are preserved,
  no throw on malformed input.
- Per-session root: two sessions in different directories get different profiles; a worktree
  and its main checkout do not share a cache entry; missing session location falls back with
  a diagnostic.
- Context hook: L0 is pushed, state system parts are not duplicated, tool continuations do
  not re-announce.
- Compaction: `session.hook("compaction")` is separate from the context hook, does not inject
  task state and does not rewrite the summary. The next prompt re-attaches pending skills;
  awaiting-approval and denied skills follow their permission rules.
- Skill activation: `session.skill.activated` marks only the matching session and skill as
  loaded; a `pending` skill is re-attached once, then suppressed for the task generation
  after two attempts. `awaiting-approval` and `denied` skills are not re-attached.
- Permissions: router-selected denied skills are not attached; explicit `@skill-id` denied
  skills stay in the prompt but are recorded as `denied`; `ask` is attached once and not
  bypassed; `awaiting-approval` becomes `activated` only after activation; a permissions
  change clears `denied` and allows retry; neither denial nor approval bypass marks a skill
  as loaded.
- Approval flow: an `ask` skill is not re-attached while awaiting approval; if the host
  approves, the activation event marks it loaded; if the host denies, the state moves to
  `denied` without a second attachment in the same prompt.
- State persistence: in-memory state is authoritative; `ctx.storage` is written and
  recovered best-effort; a storage failure does not break routing; the state system part is
  re-created after compaction.
- Verification tool: fake `php`, `composer`, `phpunit`, `phpstan`, `php-cs-fixer` binaries;
  passed, failed, warning, skipped, unavailable, timed-out and cancelled paths; aggregate
  status calculation.
- Changed-file scope: staged, unstaged, untracked, renamed and deleted files; no VCS;
  empty changed list; production-to-test mapping; full-suite fallback.
- Scanner: fixture PHP files for layers, imports, type switches, static state and metrics;
  JSON parser tests that do not require PHP; a PHP-enabled CI job for the script itself;
  content-cache and metadata-cache invalidation.

### Fixtures

Add:

- `fixtures/php-app/` — application layout, public entry point, migrations.
- `fixtures/php-app-no-type/` — application that omits Composer `type`; must classify as
  application from layout, not library.
- `fixtures/php-library/` — explicit `type: library`, public API, no app entry point.
- `fixtures/php-library-no-type/` — package shape without `type`; must not be forced to
  library without enough evidence.
- `fixtures/php-legacy/` — no Composer, mixed layout.
- `fixtures/php-framework/` — composer.json with framework hints, no framework code.
- `fixtures/php-bad-architecture/` — layer violations, fat class, type switch, singleton.
- `fixtures/php-no-tools/` — PHP project with no test/static/style tooling.
- `fixtures/php-worktree/` — second checkout of `php-app` for per-root cache tests.

### Evaluation scorecard

Measure the toolkit with and without routing on the fixture matrix:

| Metric | Target |
| --- | --- |
| Precision on strong/explicit prompts | ≥ 90% |
| False-positive routing on non-PHP/ambiguous prompts | < 5% |
| Concern leakage into an unrelated new task | 0 |
| Application/library classification on fixtures | 100% |
| Context attached per route | ≤ 3 skills and ≤ 12k chars in 95% of routes |
| Build/Design/Test tasks with a verification reminder | 100% |
| Build/Design/Test tasks that run at least one available check | ≥ 80% |
| Changed-scope verification that reports success without a determinate file list | 0 |
| Attached skills marked loaded without `session.skill.activated` | 0 |
| Compaction summaries containing injected routing state | 0 |
| Existing test suite | No regressions |
| Agent output quality (design rationale, pattern fit, tests) | Materially better than toolkit-off baseline |

The primary product question is not "did it select `php-architecture`?" It is "did the agent
produce a materially better result with the toolkit enabled?"

## 16. Phases and acceptance criteria

### Phase 1 — Foundation (P0)

Deliverables:

- Engineering constitution (L0).
- Project Profile service with per-session root resolution, application/library confidence and
  cache.
- Routing catalog for existing eight skills with the deterministic signal dictionary.
- Two-dimensional classifier and selector with fixed thresholds and tie-breaks.
- Task-generation state machine for continuation and reset.
- Prompt hook attachment, selected/attached/activated state, context system parts and
  best-effort `ctx.storage` persistence.
- `session.skill.activated` and `session.permissions` subscriptions with pending,
  awaiting-approval and denied skill handling.
- Separate compaction hook (no-op by default).
- Config parsing and escape hatches.
- `/php-toolkit-status`.
- Metrics v3 migration.
- Unit and integration tests for routing, profile and session state.

Acceptance:

- A review prompt attaches review-relevant skills; a build prompt attaches build-relevant
  skills; a non-PHP prompt attaches nothing.
- Explicit `@skill-id` is preserved and never removed by the router; the host still enforces
  `ask`/`deny`.
- Budget is enforced; dropped skills have reason codes.
- Two sessions in different roots do not share a profile; a worktree is isolated.
- An unrelated new task does not inherit prior concerns.
- An attached skill is not marked loaded until `session.skill.activated` confirms it.
- A router-selected denied skill is not attached; an explicit denied skill stays in the
  prompt but is recorded as `denied` and never marked loaded.
- An `ask` skill is attached once, awaits the host decision, and is not bypassed or
  re-attached while awaiting approval.
- A permissions change clears `denied` and allows the next prompt to retry.
- Compaction does not receive injected routing state.
- No prompt-admission failure when routing or storage fails.
- Existing tests pass; the routing corpus passes with expected skill sets.
- Status command shows profile, type confidence, task generation, selection and reasons.

### Phase 2 — Pattern library and architecture behavior (P0)

Deliverables:

- `php-design-patterns` router/index skill with the problem-first table.
- Four P0 hidden core pattern skills: strategy, adapter, decorator, state.
- Long-tail references with the required template, including repository and ports-adapters.
- Risk-based architecture mode and architecture guidance in the state system part.
- Guardrails, pattern selection rules and "when not to use" content.
- Catalog/content validation tests.

Acceptance:

- A design prompt attaches `php-architecture` + `php-design-patterns` (+ testing when
  appropriate).
- A narrow pattern prompt attaches the relevant core pattern skill; a second core pattern
  skill is allowed only when two distinct promoted patterns are named in a task and the
  budget permits; comparisons use the index.
- The model reads at most two references in the evaluation runs.
- Small changes are not gated; significant changes request approval.
- Repository is not promoted in P0 and its reference explains when a simple persistence
  service is enough.
- Pattern-tourism review of the evaluation corpus passes.

### Phase 3 — Verification (P0)

Deliverables:

- `php_verify` tool with lint, composer, tests, static, style and architecture checks.
- Non-mutating execution contract and explicit side-effect documentation.
- Orchestration of the existing `php_lint`, `composerValidate`, `php_static_analysis` and
  `php_test` functions; no duplicate parsers. Audit and outdated remain separate network
  tools.
- VCS-derived changed-file scope with production-to-test mapping and full-suite fallback.
- Normalized per-check and aggregate statuses.
- Tool detection, timeouts, AbortSignal, output caps and permission respect.
- Completion reminder for Build/Design/Test.
- Verification metrics.
- Fake-binary tests.

Acceptance:

- The tool runs available checks and reports passed/failed/warning/skipped/unavailable/
  timed-out/cancelled accurately.
- It never installs tools or edits configuration.
- It respects host permission decisions for commands it executes; a denied test or analyzer
  command is reported as `cancelled`/`unavailable`, never bypassed.
- It respects `AbortSignal` and per-check timeouts.
- It never passes production source paths as test paths.
- It never reports success when changed-file scope could not be determined.
- Existing failures are not ignored.
- Deptrac is used when configured; configured scanner boundaries report
  `scanner-unavailable` until Phase 5.
- Build/Design/Test tasks include the completion reminder.
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
- `php_architecture_scan` tool and `php_verify` architecture adapter.
- `php-toolkit.json` boundary configuration.
- Cache with content/config/version fingerprint and best-effort metadata mode.
- Fixture tests and performance caps.

Acceptance:

- Scanner reports objective findings and architectural hypotheses separately.
- No layer violation is reported without configured boundaries.
- Cache invalidates on file/config/lock/toolkit changes.
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

### Deferred work and explicit decisions

| Item | Decision |
| --- | --- |
| Normalized verification statuses | Adopted in Phase 3. Per-check and aggregate statuses are distinct and deterministic. |
| Scanner/verification phase dependency | Phase 3 uses Deptrac only when configured; the scanner adapter is Phase 5. Phase 3 never depends on an unimplemented scanner. |
| Scanner cache semantics | Content hash for files up to 1 MB; metadata fingerprint is explicitly best-effort above that; `composer.lock` content invalidates the profile. |
| User-facing announcements | Silent in P0. `on-change` and `always` are opt-in for hosts with a non-turn-triggering notification surface. `/php-toolkit-status` is the diagnostic path. |
| Pattern-library scope | Four P0 core pattern skills; five promoted in P1; the long tail remains references. Promotion requires demonstrated benefit. |
| Automatic architecture scanning | `architectureScan: "auto"` remains opt-in and bounded; the default is on-demand. |
| TUI notifications | Deferred. No synthetic messages are used to announce routing. |
| Instruction entries (`session.instructions.entry`) | Deferred, experimental. Phase 1 uses context-hook system parts on the locked `@opencode/plugin@2.0.26`. `@opencode/plugin@2.2.5` exposes keyed entries experimentally; adoption needs a deliberate dependency bump, a spike and no change to the state model (Section 19, item 14). |
| LLM-assisted classification | Deferred to Phase 7. Deterministic routing remains the default. |
| Architecture drift detection | Phase 6, P2. |
| Framework-specific rules | Out of scope; sibling toolkits own Laravel/Symfony/WordPress specifics. |

## 17. Migration and compatibility

- Start implementation from `main` after PR #4 (merged); do not rely on an unmerged
  improvement branch. The four required tools (`php_test`, `php_static_analysis`,
  `php_composer_outdated`, enriched `php_project_detect`) are present and composable
  there — verified 2026-11-04. Do not reimplement them in the router.
- Existing skill IDs, command names, tool names and agent files remain valid.
- Existing behavior is available through `autoSkills: "off"`.
- `PHP_SYSTEM_HINT` is replaced by the L0 constitution; the PHP-specific defaults are
  preserved in L0.
- Routing is silent by default. The previous `announceSelections: "on-change"` behavior is
  opt-in, not the default.
- Project discovery becomes per session instead of per plugin instance. A global install now
  works across repositories and worktrees without a configuration change.
- `loadedSkills` is replaced by `selected` / `attached` / `activated` plus the
  `pending` / `awaiting-approval` / `denied` unactivated states; only activation suppresses
  re-attachment for the task.
- Metrics v2 documents migrate to v3 by adding empty routing/verification/scanner sections.
- New configuration is optional; defaults are chosen for least friction.
- The new behavior is a minor version bump (target `0.2.0` for Phase 1; later phases may
  ship as `0.3.0`, `0.4.0`, etc.). The README and changelog must call out the behavior
  change.

## 18. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Prompt hook cannot attach hidden skills as expected. | Validate in Phase 1; fallback to an advertised `php-design-patterns` router skill + references. |
| Context system parts are not visible, are overwritten, or do not survive compaction. | Validate in Phase 1; L0 is a stable system part and state is re-rendered on every primary context request; `ctx.storage` plus the last user message provide recovery. |
| Keyed instruction entries are experimental and absent from the locked `@opencode/plugin@2.0.26` | Context-hook system parts remain the transport; entries are an optional follow-up gated on a deliberate dependency bump to 2.2.x and a spike (Section 19, item 14). |
| Application misclassified as a library because Composer omits `type`. | Missing `type` is neutral; multi-signal scoring with confidence; fixtures for app-without-type and package-without-type. |
| Concerns accumulate across unrelated tasks. | Task generations; concerns recomputed on a new task; merge only for confirmed continuations; no leakage target in the scorecard. |
| Routing is too eager or too blunt. | Precision over recall, fixed thresholds, explicit wins, corpus tests, task boundaries. |
| Context bloat. | L0–L3, max 3 skills / 12k chars, hidden pattern skills, on-demand references, one or two pattern skills. |
| Architecture gatekeeping annoys users. | Risk-based default, strict mode opt-in, fluid `/php-design`, one-line rationale for small changes. |
| Pattern tourism. | Problem-first library, "when not to use", two-implementation/test-seam rule, staged promotion, evaluation corpus. |
| Pattern library becomes a separate content project. | P0 promotes four pattern skills; the rest are references; promotion requires demonstrated benefit. |
| Scanner overclaims. | Advisory findings vs hypotheses, explicit boundaries, no anemic-domain detection, no inferred violations. |
| Verification noise or false failures. | Detect available tools, normalized statuses, no installs/config edits, output caps, changed-file scope. |
| Verification executes project code with side effects. | Document the non-mutating contract precisely; respect host permissions; timeouts; no network by default. |
| Changed-file scope maps production files to tests incorrectly. | Direct changed tests, convention-based mapping, full-suite fallback, never pass source paths to the runner. |
| Changed-file scope is unknowable without VCS. | Report `unavailable`, suggest `scope: "all"`, never report success. |
| Compaction hook is confused with the context hook. | Separate `session.hook("compaction")`; no `kind` field; no task injection; integration test. |
| Global install uses the wrong project root. | Resolve `session.location.directory` + `subpath` per session; cache by root; worktree fixture. |
| Attached skills are mistaken for loaded skills. | `session.skill.activated` is the only proof; unactivated skills are retried and then suppressed per task. |
| Denied and awaiting-approval skills are confused. | Use the session permission snapshot when its skill rule shape is interpretable; otherwise keep `pending`; never infer denial from missing activation. |
| Privacy leakage. | No prompt text/code in metrics; scan summaries contain file paths and finding kinds only; README documents model-bound data. |
| Performance. | Cache profiles and scans, timeouts, maxFiles, no auto scan by default, no per-turn state churn. |
| Maintenance burden. | Catalog integrity tests, shared router contract, content template validation. |
| User distrust of automatic behavior. | Silent by default, `/php-toolkit-status`, config escape hatches, no prompt rewriting. |

## 19. Validation assumptions

These are validated in Phase 1 before the pattern library is built. Items 10 and 12 were
verified 2026-11-04 against the installed `@opencode/plugin@2.0.26` /
`@opencode/client@2.0.26`; the rest remain Phase 1 gates.

1. `event.prompt.skills` attaches skill bodies through the normal resolution path.
2. A skill with `autoinvoke: false` (or the equivalent `disable-model-invocation: true`
   used by the prior prototype) can be attached by ID via the prompt hook.
3. Skill permissions (`ask`/`deny`) are respected and not bypassed, and denial does not
   produce a `session.skill.activated` event.
4. `ctx.event.subscribe()` delivers `session.skill.activated` with `data.sessionID` and
   `data.id`, reliably enough to track loaded skills.
5. Attaching a skill the model already activated does not duplicate content, or the plugin
   avoids re-attachment through `activatedSkills`.
6. `session.hook("context")` runs for primary agent-loop requests and tool continuations,
   its `system` array is mutable, and appended system parts are visible to the model.
7. `ctx.storage.get` / `set` / `remove` persist per-key JSON across plugin lifetimes and are
   fast enough for a small per-session state document. If storage is ephemeral, recovery
   falls back to the last user message from `ctx.session.context({ sessionID })`.
8. `ctx.session.get({ sessionID })` returns `location.directory` and `subpath` for the
   session, and is fast enough to resolve the project root in the prompt hook.
9. `session.hook("compaction")` is a separate hook and does not receive a `kind` field.
10. `ctx.vcs.status({ location: { directory } })` reports working-tree entries including
    staged, unstaged and untracked changes as `added`/`modified`/`deleted`; a no-VCS
    repository returns an error or empty result that can be distinguished from a clean
    working tree. Verified against the installed `@opencode/client@2.0.26`: the response
    is `{ location, data: [{ file, additions, deletions, status }] }`, with `status` one
    of `added`/`modified`/`deleted`.
11. Prompt hooks run for command-submitted prompts (`ctx.session.prompt`).
12. The tools added in PR #4 — `php_test`, `php_static_analysis`,
    `php_composer_outdated` and enriched `php_project_detect` are available to compose.
    Satisfied on `main` after PR #4 (merged `4011468`) — verified 2026-11-04: the four
    tools exist in `src/index.ts`/`src/tools/php-tools.ts`, and `detectPhpProject`
    reads analyzer/fixer config files and `config.platform.php`.
13. The hidden-skill prototype's registration path is reusable; if not, the router falls
    back to an advertised `php-design-patterns` skill with references.
14. Instruction entries (keyed context blocks announced at the next step boundary, without a
    message turn) are exposed only experimentally by newer plugins, and the locked plugin
    does not expose them. Verified 2026-11-04:
    - `@opencode/plugin@2.0.26` (the version pinned by `package.json` and the lockfile)
      does not surface `session.instructions` in its curated `SessionDomain`; its
      `Pick<SessionApi, ...>` omits it. The underlying `@opencode/client@2.0.26`
      generated API does contain `session.instructions.entry.list/put/remove`
      (`SessionInstructionsEntry{List,Put,Remove}Input`) but the plugin context does
      not forward it.
    - `@opencode/plugin@2.2.5` (latest; also what a fresh install of `^2.0.26` resolves
      to) exposes `ctx.session.instructions` as `Pick<ExperimentalSessionApi, "wait" |
      "instructions">` — an explicitly experimental API. Because it is experimental and
      version-sensitive, the locked 2.0.26 remains the Phase 1 contract: the state
      system part (context hook) stays the transport, and a fresh install must not
      silently change behavior.
    - Adopting keyed entries is a follow-up that requires (i) a deliberate dependency bump,
      (ii) a spike confirming `put`/`remove` semantics, key budgets and ordering against
      the L0 constitution, and (iii) no change to the state model. Because it removes the
      per-turn system-part rewrite entirely, it is preferred once proven — but Phase 1
      does not depend on it.
15. `Session.Info.permissions` and `session.permissions` events expose skill rules in a
    shape the plugin can interpret (`action: "skill"`, resource matching the skill ID). If
    not, unactivated skills remain `pending` and activation remains the only proof.

If any assumption fails, the fallback is documented in Section 18 and the phase scope is
adjusted before implementation proceeds.

## 20. Self-review

- No placeholders or unresolved decisions.
- The design is phased; each phase is independently shippable.
- Existing surfaces are preserved; the new behavior is opt-out.
- Least-friction defaults are explicit: risk-based architecture, on-demand scanning, silent
  routing, no prompt rewriting.
- Application/library classification does not rely on Composer's implicit `library` default.
- Routing is deterministic: fixed signal dictionary, thresholds, conflict resolution and
  tie-breaks, with expected skill sets in the corpus.
- Task generations prevent concern accumulation across unrelated work.
- Changed-file verification distinguishes source from tests, uses the host VCS API and never
  reports success when scope is unknown.
- Verification is non-mutating with respect to source, manifests and configuration, and
  explicitly documents that tests execute project code.
- The compaction hook is separate from the context hook and does not inject task state.
- Project profiles and routing state are per session root, not per plugin install.
- Model-facing state uses context-hook system parts; persistence uses `ctx.storage`
  best-effort. The design does not depend on keyed instruction entries, which the locked
  `@opencode/plugin@2.0.26` does not expose; 2.2.x exposes them experimentally as a
  gated follow-up (Section 19, item 14).
- Selected, attached, activated, pending, awaiting-approval and denied skills are distinct;
  only activation suppresses re-attachment for the task, and denial is cleared by a
  permissions change.
- The three layers are covered: knowledge (skills/references), guidance (router/profile/
  constitution), verification (`php_verify`).
- The scanner's limits are explicit; it is advisory and boundary-driven.
- The pattern library is problem-first, staged, and includes "when not to use."
- The verification layer uses normalized per-check and aggregate statuses.
- Testing covers routing, profile, task boundaries, per-session roots, skill activation,
  verification scope, scanner cache and end-to-end evaluation.

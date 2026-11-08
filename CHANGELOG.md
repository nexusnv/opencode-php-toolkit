# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-08

### Added

- Problem-first `php-design-patterns` index skill with the engineering-problem
  table, guardrails, pattern selection rule, and 34 on-demand references
  (repository, ports & adapters, DDD, CQRS, event sourcing and the classic
  catalog). References never count against the attachment budget.
- Four hidden P0 core pattern skills: `php-pattern-strategy`,
  `php-pattern-adapter`, `php-pattern-decorator`, `php-pattern-state`. They
  register with `autoinvoke: false` and are attached only by the router.
- Deterministic pattern selection: Design attaches the index by default; one
  named promoted pattern attaches that core skill; two or more named patterns
  in an actionable task attach at most two; comparison and knowledge questions
  use the index; P1 names fall back to the index. Patterns require a score of
  `>= 2` outside the Design intent.
- Risk-based architecture guidance in the state part. `architectureMode:
  "risk"` renders small/moderate/significant change expectations, `"strict"`
  requires a design note and approval, and `"off"` removes the line.
- The full R01–R50 routing corpus is enabled for Phase 2, including pattern
  index, core pattern, comparison and P1 fallback cases.

### Fixed

- Multi-word concern phrases now consume their tokens across concern targets,
  so a Testing `data provider` no longer also scores the Design patterns
  `provider` signal. Single tokens may still score more than one concern.

### Changed

- The routing catalog distinguishes concern, Maintain, pattern-index and
  pattern-core entries; the pattern index is advertised and core pattern
  skills stay hidden.

## [0.2.0] - 2026-11-04

### Added

- Deterministic intent × concern routing for the eight existing PHP skills.
  PHP-context prompts are classified into intents (Build, Design, Review,
  Debug, Test, Maintain) and concerns (Security, Testing, Debugging, Static
  analysis, Architecture, Design patterns, Coding standards, Dependencies);
  up to three skills attach silently. A high-confidence Security concern may
  use the fourth hard-ceiling slot, and Maintain subtypes survive continuations.
  `architectureMode: "off"` disables classifier design gating. No pattern
  skills ship in this phase.
- Routing lifecycle hardening: persisted activation/permission events hydrate
  sessions after a restart, writes are serialized per session, stale session
  documents are pruned after 30 days since the last recorded PHP-context
  prompt (or the task start when no prompt is recorded), and routing
  metrics attribute to the session’s project root. `maxSkillChars` is capped
  at 16,000, and reserved later-phase options have no effect yet. A non-PHP
  prompt drops the previous routing-state system part for the session, and
  the `resets` routing counter counts explicit task switches while
  `taskGenerations` counts every new task.
- Per-session project profiles with application/library confidence and
  root+subpath isolation.
- L0 engineering constitution, replacing the static one-line typed-PHP hint.
- Task-generation boundaries so unrelated tasks do not inherit prior
  concerns.
- Selected/attached/activated skill state with permission-aware attachment;
  denied router skills are recorded but never attached.
- `/php-toolkit-status` diagnostics, metrics v3 routing counters and
  best-effort session persistence.
- `autoSkills: "hint" | "off"` escape hatches; the default remains `attach`
  and silent.
- `php_static_analysis` tool: PHPStan (or Psalm when absent) with JSON output.
  Analysis errors count as findings; an unusable analyzer is an error, never a
  false zero. Pass `tool: "phpstan" | "psalm"` to force one.
- `php_test` tool: runs `vendor/bin/pest` or `vendor/bin/phpunit` against
  JUnit output and reports failing tests as findings. It executes project
  code, is time-boxed (300s) and only ever uses the vendor binary, never a
  bare PATH binary.
- `php_composer_outdated` tool: direct dependencies with a newer version
  (network; the count is reported as findings).
- `php_metrics` input flags: `reset: true` deletes this project's metrics
  document (immediate, no undo), `export: true` dumps the snapshot as raw JSON
  (reflects the state before any reset).
- `php_project_detect` reports analyzer/fixer config files (`phpstan.neon*`,
  `psalm.xml*`, `.php-cs-fixer.{php,dist.php}`, `rector.php`) and
  `composer config.platform.php`.
- Skills register `autoinvoke: true`, matching the documented behavior.
- CI workflow: typecheck, tests, build, `dist/`-drift check, plugin import and
  `npm pack` smoke tests on Node 22/24, plus a Node 20 compat job (the
  published engines floor); Dependabot for npm and GitHub Actions.

### Fixed

- Metrics: `flush()` no longer drops tool/command increments recorded while a
  write was in flight.
- Metrics: `flush()` refuses to overwrite a document written by a newer
  format, and retries instead of overwriting when the document cannot be
  re-read — neither case destroys counts any more.
- `php_static_analysis` counts file-specific PHPStan errors: `totals.errors`
  only covers errors not tied to a file, `totals.file_errors` carries the
  rest — a typical run reported 0 findings before. JSON without report
  fields on a failing exit is now an analyzer error, not a clean run.
- `php_test` failure lines point at the failing test's own file/line (a
  passing self-closing testcase earlier in the JUnit report stole the
  attribution), failure messages decode numeric XML entities (`&#10;`) so
  multi-line messages render their first line instead of the escape, and an
  exit-0 run without a JUnit report no longer claims tests passed.
- PHPStan's fallback count (when `totals` is missing) counts every message
  instead of stopping at the 20-line display cap.
- Tools resolve the requested `directory` once, so a relative path can no
  longer make the tool run in one directory and record its metrics in
  another (or double-resolve vendor binary paths).
- An already-aborted signal now prevents the child process from spawning
  instead of running to its timeout; report output above the old 1 MiB
  capture limit no longer truncates into tool errors.
- Metrics: init/flush/reset are serialized per store, so a reset can no
  longer interleave with an in-flight flush and old counts cannot come back
  after the wipe. Reset writes an empty document instead of deleting the
  key, so machine-global legacy history is not re-adopted on next startup.
  Metrics are keyed by the canonical project path, so a session that opened
  the project through a symlink and one that opened it directly share one
  document. Concurrent same-millisecond merges keep the newer status.
- Metrics: `export: true` returns raw JSON (no prose prefix) and omits the
  absolute `projectPath`, matching the rendered view's privacy promise.
- Metrics: a write failure before a `reset` no longer silences the log for
  later failures.
- `php_project_detect` reports the lock file and analyzer/fixer configs even
  when `composer.json` is malformed (the probes no longer run after the
  early return).
- The typed-PHP system hint triggers on clear PHP mentions only ("pest" and
  "psalm" alone no longer qualify) and scans message text in full.
- The `composer.json` check for the system hint runs per request, so a
  manifest created mid-session is picked up without a plugin reload.
- `postinstall.mjs` resolves the package path with `fileURLToPath` (installs
  under paths with spaces or on Windows) and never overwrites an existing
  agent file, so customized agents survive upgrades.
- CI: `persist-credentials: false` on both checkouts, and the `dist/` drift
  check stages the directory first so never-committed build outputs fail it.
- Skills: the registered `path` now points inside the package (it pointed at
  the active project root, where the file never existed).
- Tools: `composer audit` no-lock prose output ("No packages - skipping
  audit.", exit 0) is treated as a clean audit, not an error.
- Detection: Mago is reported when `carthage-software/mago` is installed
  (was hardcoded to absent).
- Tools: `php_lint` says so when it lints only the first 20 of N paths
  instead of truncating silently.
- Tools: child stderr is surfaced verbatim instead of the generic
  `Command failed: ...` wrapper (kept as a fallback for spawn failures).
- Metrics display: machine-wide rows align on their actual labels; dead
  branch removed.
- Metrics attribution: work done through an inside-project symlink is
  attributed to its real location.
- Hooks: the typed-PHP system hint is only injected for PHP projects or
  requests whose user messages mention PHP — unrelated sessions stop paying
  the tokens.
- `postinstall.mjs`: shipped and wired (it was never run and contained fatal
  TypeScript syntax). Copies the four agents into `~/.config/opencode/agents`
  on install; opt out with `PHP_TOOLKIT_SKIP_AGENT_COPY=1`.
- Package metadata: `repository`, `bugs`, `homepage`, `author`.

## [0.1.1] - 2026-10-14

### Changed

- `dist/` is tracked in git so git-based installs work without a build step
  (root `index.js` shim re-exports `./dist/index.js`).

### Added

- Git install instructions (pinned specs, `EALLOWGIT` note) and a release
  checklist (npm provenance / `min-release-age`).

## [0.1.0] - 2026-10-14

### Added

- Initial release: framework-agnostic PHP 8.1+ toolkit for OpenCode v2
  (review, static analysis, tests, security, modernize, composer,
  architecture, debug).
- 8 autoinvoke skills, 7 commands, 4 tools (`php_project_detect`, `php_lint`,
  `php_composer_audit`, `php_metrics`) and 4 subagents.
- Local-only, per-project usage metrics: runs/ok/error/findings per tool,
  command counts, PHP prompt triggers; machine-wide view; nothing leaves the
  machine.
- Hooks: PHP prompt tagging, typed-PHP system hint, destructive-command
  guard (log-only, dry-run advice).

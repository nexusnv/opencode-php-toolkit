# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

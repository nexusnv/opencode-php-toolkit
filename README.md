# opencode-php-toolkit

[![CI](https://github.com/nexusnv/opencode-php-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/nexusnv/opencode-php-toolkit/actions/workflows/ci.yml)

Framework-agnostic PHP toolkit for OpenCode v2. Hard-to-miss defaults for PHP 8.1+ developers: review, static analysis, tests, security, modernize, composer, architecture, debug.

Laravel/Symfony specifics live in sibling repos (`opencode-laravel-toolkit`, `opencode-symfony-toolkit`). This package never assumes a framework — it detects and defers.

Built on the newest v2 plugin framework: `Plugin.define({ id, setup(ctx) })` + `ctx.skill/command/tool.transform` + `ctx.session.hook`. See https://opencode.ai/v2/docs/build/plugins.

## Install

Published package (after `npm publish`):

```jsonc
// opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-php-toolkit@0.2.0"]
}
```

> On install, the package copies the four `agents/php-*.md` files into
> `~/.config/opencode/agents/` as a convenience (see below). Existing files
> are never overwritten — a customized agent keeps its content across
> installs and upgrades; delete the file to get the bundled version back.
> Set `PHP_TOOLKIT_SKIP_AGENT_COPY=1` before installing to skip that copy;
> the rest of the plugin is unaffected.

From git (no npm publish needed — `dist/` is committed, so clones work
as-is; always run `npm run build` before committing):

```sh
# Latest on main
opencode plugin add github:nexusnv/opencode-php-toolkit
# Pinned (recommended for teams)
opencode plugin add github:nexusnv/opencode-php-toolkit#v0.2.0
```

Or per-project in `opencode.jsonc` (same spec forms, plus branch/commit):

```jsonc
{
  "plugins": [
    "github:nexusnv/opencode-php-toolkit#v0.2.0",
    "github:nexusnv/opencode-php-toolkit#main",
    "git+ssh://git@github.com/nexusnv/opencode-php-toolkit.git#6eb66d4"
  ]
}
```

> Note: some environments disable git dependency fetching (`EALLOWGIT` /
> `git dep preparation failed`). That is a local npm policy, not a repo
> problem — on such machines use the local path form below or the npm
> package instead.

Local dev:

```jsonc
{
  "plugins": ["file:///home/leonidas/dev/nexusnv/opencode-php-toolkit"]
}
```

Or CLI:

```sh
opencode plugin add file:///home/leonidas/dev/nexusnv/opencode-php-toolkit
```

## What you get

- Agents (`agents/php-*.md`, `mode: subagent`): `php-reviewer`, `php-debugger`, `php-modernizer`, `php-tester`. On install, the package's `postinstall` script copies these four files into `~/.config/opencode/agents/` as a convenience, never overwriting files that already exist (v2 `AgentEditor` has no `add`; transforms can't create agents — files are the source of truth). Set `PHP_TOOLKIT_SKIP_AGENT_COPY=1` in the environment to opt out. The script writes nothing besides those four files (the OpenCode `commands/` directory is not touched). To undo after install, delete `php-reviewer.md`, `php-debugger.md`, `php-modernizer.md` and `php-tester.md` from `~/.config/opencode/agents/`.
- Skills (8, autoinvoke): `php-standards`, `php-static-analysis`, `php-testing`, `php-security`, `php-modernize`, `php-composer`, `php-architecture`, `php-debug`.
- Commands (8): `/php-review`, `/php-analyze`, `/php-fix-style`, `/php-test`, `/php-audit`, `/php-upgrade`, `/php-scaffold`, `/php-toolkit-status`.
- Tools (`php_*` namespace, read-only unless noted):
  - `php_project_detect` — composer intel incl. analyzer/fixer config files and `composer config.platform.php`; no exec
  - `php_lint` — `php -l` + `composer validate`
  - `php_composer_audit` — known-vulnerable dependencies (network)
  - `php_composer_outdated` — direct deps with a newer version (network; the repositories configured in the project's `composer.json` determine which hosts Composer contacts)
  - `php_static_analysis` — PHPStan (or Psalm when absent), JSON output; analysis errors count as findings; **executes project-configured code** (analyzer binaries run bootstrap files, autoload and Psalm plugins with this session's privileges)
  - `php_test` — runs `vendor/bin/pest` or `vendor/bin/phpunit` against JUnit output; **executes project code** (tests only, 300s timeout, never a bare PATH binary)
  - `php_metrics` — local usage metrics; `reset: true` clears this project's metrics, `export: true` dumps the snapshot as raw JSON (absolute project path omitted)
- Hooks: `prompt` runs deterministic routing for PHP-context prompts, `context` adds the stable L0 engineering constitution plus one compact routing-state part, `tool.execute.before` warns on destructive `composer update` / `rector process` without `--dry-run` / `php-cs-fixer fix` without `--dry-run`.

## Reactive routing (0.2.0)

Routing is deterministic, silent and risk-based by default. The plugin classifies each
PHP-context prompt into at most two intents (Build, Design, Review, Debug, Test, Maintain)
and three concerns (Security, Testing, Debugging, Static analysis, Architecture, Design
patterns, Coding standards, Dependencies), then attaches up to three of the eight existing
skills. No pattern skills ship in this phase. Non-PHP prompts attach nothing.

Attached is not loaded. `/php-toolkit-status` reports `selected`, `attached` and
`activated` separately; only a `session.skill.activated` event proves a skill loaded.
OpenCode still enforces skill permissions: a denied router skill is recorded but never
attached, and an `ask` skill is attached once while the host owns approval.

```
PHP toolkit status
  Project: /work/app (application, high confidence, PHP ^8.3, PHPUnit + PHPStan, no framework)
  Root: /work/app (subpath: none)
  Task: generation 2
  Active: build | concerns: testing, security
  Selected: php-testing, php-security
  Attached: php-testing, php-security
  Activated: php-testing
  Pending: php-security
  Dropped: php-standards (budget:max-skills)
  Reasons: intent:build, concern:testing, concern:security, budget:max-skills
  Mode: risk | scan: off | announce: off
  Verify: unavailable (Phase 3)
```

`selected` is what the classifier chose, `attached` is what was merged into the
prompt, `activated` is what the host confirmed loaded, and `pending` lists attached
skills still waiting for activation. `Reasons` contains intent/concern labels and
drop reasons only — never prompt text.

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

- `autoSkills: "hint"` records recommendations without attaching them.
- `autoSkills: "off"` restores passive behavior; the L0 constitution remains active.
- `architectureMode: "off"` disables design gating.
- `announceSelections` remains `off` by default; routing uses no synthetic announcement
  messages.

## Local metrics

`php_metrics` shows what the toolkit actually did in the project you are
working in:

```
PHP toolkit metrics (local-only, never leaves this machine)
  Project: my-app
  Tracking since: 2026-10-21 09:00Z
  PHP-mentioning prompts: 12

  Tools
    php_lint             3 runs    3 ok / 0 error   2 findings   last 2026-10-21 09:12Z
    php_project_detect   5 runs    5 ok / 0 error   0 findings   last 2026-10-21 09:14Z

  Commands
    php-review           2 invocations   last 2026-10-21 09:15Z

  Routing
    generations 3   continuations 1   resets 3
    most selected   php-testing (4), php-security (2)
    activations     3                 dropped 1

  Impact: 2 issues surfaced by the toolkit in this project.
```

- **Runs / ok / error** — how often a tool ran, and whether it completed the
  work it was asked to do. A tool that could not complete it (missing `php`,
  a timeout, a file it could not read) is an *error*.
- **Findings** — issues the toolkit surfaced in your code: parse errors found
  by `php_lint`, advisories reported by `php_composer_audit`, a malformed or
  invalid `composer.json`. A lint that finds a broken file is a *successful*
  lint with a finding, not an error.
- **Per project.** Each project root gets its own document, so the snapshot
  describes the codebase you are in. A tool pointed at a directory outside the
  active project is counted against that directory instead, so one project's
  numbers never absorb another's. Pass `allProjects: true` to `php_metrics`
  for the machine-wide breakdown. That view is eventually consistent: a
  session running elsewhere may still have unsaved events.
  `php_metrics` also accepts `reset: true` to clear this project's metrics
  (immediate, no undo — the document is replaced with an empty one, which
  also prevents machine-global legacy history from being re-adopted here) and
  `export: true` to return the snapshot as raw JSON instead of the rendered
  view (export reflects the state before any `reset` is applied; the
  absolute `projectPath` is omitted so the export keeps the rendered view's
  no-absolute-paths promise; combined with `reset`, the JSON is followed by
  the reset confirmation).

### Privacy

Metrics themselves never leave your machine:

- Metrics are written to OpenCode's local storage only
  (`~/.local/share/opencode/opencode.db`, key `php-toolkit.metrics.<hash>`).
- Session routing state is written to the same local storage under
  `php-toolkit:session:<sessionID>`: project profile summary, task generation,
  intent/concern labels and skill IDs. It never stores prompt text, file contents or
  code. The stored document retains the local project root for scope validation; the
  model-facing state part contains no absolute path.
- The plugin makes no outbound requests of its own.
- Only counts, timestamps, routing labels and the project path are recorded — never file
  contents, file names, code or prompt text.

Two things worth knowing precisely:

- **`php_composer_audit` and `php_composer_outdated` reach the network.**
  They run
  `composer audit` / `composer outdated`, which contact the repositories
  configured in the project's `composer.json` (Packagist by default) to look
  up known vulnerabilities and newer releases. That request is made by
  Composer, on your behalf, when you ask for it — the plugin does not
  transmit anything itself, and a project pointing Composer at other hosts
  determines where the requests go.
- **`php_test` executes project code.** It runs the project's own test suite
  (vendor binary only, explicit working directory, 300s timeout) — treat it
  like running `vendor/bin/phpunit` yourself.
- **The snapshot is tool output.** `php_metrics` returns the snapshot as tool
  content, so with a remote model provider it is included in that request.
  The snapshot therefore contains no absolute paths, no file names and no
  code — only counts, timings and the project folder name.

Removing the plugin does not delete the metrics: the rows stay in OpenCode's
local database. To drop a project's history, delete its
`php-toolkit.metrics.<hash>` row (or the whole database).

## Verify

```sh
npm install
npm run typecheck
npm test
npm run build
node -e "import('./dist/index.js').then(m=>console.log(m.default.id))"
php -l fixtures/php-sample/src/Calculator.php
```

> The test suite needs Node >= 22.12 (vitest 5). The published plugin itself
> runs on Node >= 20. The tests use fake `php` and `composer` executables, so
> they do not need PHP or Composer installed.

CI runs the same checks on every push to `main` and on pull requests
(Node 22/24 with a `dist/`-drift check — any change to `src/` must ship with
the rebuilt `dist/` in the same commit — plus a Node 20 compat job that skips
the suite). See [CHANGELOG.md](./CHANGELOG.md) for what changed between
releases.

## Layout

```
index.js — package entrypoint shim (required: OpenCode loads a plugin
  directory via <dir>/index.ts|index.js, not package.json main).
  Re-exports ./dist/index.js. Keep it in `files` for publishing.
src/index.ts — Plugin.define entry
src/content.ts — markdown loader + skill/command manifests
src/tools/detect.ts — composer.json intel, no exec
src/tools/php-tools.ts — php -l, composer validate/audit/outdated, static analysis (phpstan/psalm), test runner (phpunit/pest); timeouts + AbortSignal throughout; each returns its own outcome + findings
src/constitution.ts — stable L0 engineering constitution
src/config.ts — plugin options with safe defaults
src/profile.ts — per-session project profile (application/library confidence, tools, layout)
src/routing/ — deterministic classifier, selector, task boundary, session state, persistence, permissions and orchestrator
src/context/parts.ts — L0 and compact routing-state system parts
src/status/toolkit-status.ts — `/php-toolkit-status` snapshot
src/hooks/php-context.ts — PHP triggers and destructive-pattern guard
src/metrics/store.ts — per-project metrics v3 document (storage, migration, merged writes)
src/metrics/registry.ts — one document per project, work attributed to the right one
src/metrics/format.ts — snapshot rendering
agents/php-*.md, commands/php-*.md, skills/php-*/SKILL.md
fixtures/php-sample/ — minimal PSR-4 app for smoke tests
test/ — vitest suite (metrics store, registry, snapshot format, tool outcomes)
```

> Sibling plugins (`opencode-laravel-toolkit`, `opencode-symfony-toolkit`)
> must follow the same layout: root `index.js` shim + `dist/` build +
> `php-*`-style ID prefix (`laravel-*`, `symfony-*`) to avoid collisions.

## License

MIT — NexusNV.

## Releasing

1. `npm run build` (commits fresh `dist/` — required for git installs).
2. Bump `version` in `package.json`, commit, tag `vX.Y.Z`, push all three.
3. `npm publish --no-provenance` (local publishes can't attest; use a
   Trusted Publishing workflow instead if you want provenance).
4. Fresh versions take a few minutes to appear (staged `0.0.0-stage`
   placeholder first). Machines with `min-release-age` in `~/.npmrc` won't
   `plugin add` them until that age passes — allow `0` temporarily to
   verify, then restore.

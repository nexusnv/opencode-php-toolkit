# opencode-php-toolkit

Framework-agnostic PHP toolkit for OpenCode v2. Hard-to-miss defaults for PHP 8.1+ developers: review, static analysis, tests, security, modernize, composer, architecture, debug.

Laravel/Symfony specifics live in sibling repos (`opencode-laravel-toolkit`, `opencode-symfony-toolkit`). This package never assumes a framework — it detects and defers.

Built on the newest v2 plugin framework: `Plugin.define({ id, setup(ctx) })` + `ctx.skill/command/tool.transform` + `ctx.session.hook`. See https://opencode.ai/v2/docs/build/plugins.

## Install

Published package (after `npm publish`):

```jsonc
// opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-php-toolkit@0.1.1"]
}
```

From git (no npm publish needed — `dist/` is committed, so clones work
as-is; always run `npm run build` before committing):

```sh
# Latest on main
opencode plugin add github:nexusnv/opencode-php-toolkit
# Pinned (recommended for teams)
opencode plugin add github:nexusnv/opencode-php-toolkit#v0.1.1
```

Or per-project in `opencode.jsonc` (same spec forms, plus branch/commit):

```jsonc
{
  "plugins": [
    "github:nexusnv/opencode-php-toolkit#v0.1.1",
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

- Agents (`agents/php-*.md`, `mode: subagent`): `php-reviewer`, `php-debugger`, `php-modernizer`, `php-tester`. Copied to `~/.config/opencode/agents/` on install as convenience (v2 `AgentEditor` has no `add`; transforms can't create agents — files are the source of truth).
- Skills (8, autoinvoke): `php-standards`, `php-static-analysis`, `php-testing`, `php-security`, `php-modernize`, `php-composer`, `php-architecture`, `php-debug`.
- Commands (7): `/php-review`, `/php-analyze`, `/php-fix-style`, `/php-test`, `/php-audit`, `/php-upgrade`, `/php-scaffold`.
- Tools (`php_*` namespace, read-only): `php_project_detect`, `php_lint`, `php_composer_audit`.
- Hooks: `prompt` tags PHP context, `context` adds typed-PHP system hint, `tool.execute.before` warns on destructive `composer update` / `rector process` without `--dry-run` / `php-cs-fixer fix` without `--dry-run`.

## Verify

```sh
npm install
npm run typecheck
npm run build
node -e "import('./dist/index.js').then(m=>console.log(m.default.id))"
php -l src/index.ts 2>/dev/null || true
php -l fixtures/php-sample/src/Calculator.php
```

## Layout

```
index.js — package entrypoint shim (required: OpenCode loads a plugin
  directory via <dir>/index.ts|index.js, not package.json main).
  Re-exports ./dist/index.js. Keep it in `files` for publishing.
src/index.ts — Plugin.define entry
src/content.ts — markdown loader + skill/command manifests
src/tools/detect.ts — composer.json intel, no exec
src/tools/php-tools.ts — php -l, composer validate/audit (read-only, timeouts, AbortSignal)
src/hooks/php-context.ts — system hint, triggers, destructive-pattern guard
agents/php-*.md, commands/php-*.md, skills/php-*/SKILL.md
fixtures/php-sample/ — minimal PSR-4 app for smoke tests
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

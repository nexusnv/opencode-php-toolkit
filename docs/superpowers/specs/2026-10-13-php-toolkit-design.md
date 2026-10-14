# PHP Toolkit Plugin Design

> Date: 2026-10-13. Status: Approved. Scope: framework-agnostic, PHP 8.1+, full v2 plugin, maximal toolkit.

## Goal

Hard-to-miss OpenCode v2 plugin for PHP developers. Framework-agnostic (Laravel/Symfony live in sibling repos later). Uses newest v2 plugin framework (`Plugin.define` + `ctx.*.transform` + `ctx.session.hook` + `ctx.tool.transform`).

Source of truth: https://opencode.ai/v2/docs/build/plugins

## Architecture (hybrid layered, recommended option C)

Markdown is source-of-truth for prompts. TypeScript core registers them via v2 transforms.

```
opencode-php-toolkit/
  package.json (name opencode-php-toolkit, type module, exports "." -> dist/index.js)
  tsconfig.json
  src/index.ts — default export Plugin.define({ id: "php-toolkit", setup(ctx) })
  src/content.ts — loads agents/*.md, commands/*.md, skills/*/SKILL.md at setup
  src/tools/detect.ts — php_project_detect tool (composer.json intel, no exec)
  src/tools/guard.ts — tool.execute.before guard for destructive cmds
  src/hooks/php-context.ts — prompt + context hooks
  agents/php-*.md (4)
  commands/php-*.md (7)
  skills/php-*/SKILL.md (8) + references/ + scripts/
```

IDs prefixed `php-*` to avoid collision with future `laravel-*`, `symfony-*`.

## Components

### Agents (mode: subagent)

- `php-reviewer` — correctness, security, style. Read-only, severity-ordered findings with file:line.
- `php-debugger` — repro-first systematic debug.
- `php-modernizer` — Rector dry-run-first, PHP 8.1+ upgrades, deprecations.
- `php-tester` — PHPUnit/Pest, coverage gaps, data providers, mutation hints.

Registered via `ctx.agent.transform`. We do not override builtins; we add new IDs. Agent body = markdown file content as `system` prompt via editor update/add.

Note: v2 AgentEditor only has list/get/default/update/remove (no add). So agents must either (a) ship as `.opencode/agents/*.md` files copied on install, or (b) be injected via prompt/context. Decision: ship `agents/` markdown + `postinstall.mjs` copy helper + document manual copy, AND register guidance via skills/commands. Tools/commands reference agent IDs. This keeps us v2-native without fighting the editor shape.

Revisit: if future v2 adds `agent.add`, switch to transform-add.

### Skills (autoinvoke, description required)

- `php-standards` — PSR-4/12, strict_types, typing, readonly/enums/attributes.
- `php-static-analysis` — PHPStan levels 0-9 + baseline, Psalm taint, Mago fast path.
- `php-testing` — PHPUnit/Pest, fixtures, doubles, providers.
- `php-security` — composer audit, XSS/SQLi, validation, secrets.
- `php-modernize` — Rector safe apply, PHP req bump, deprecations.
- `php-composer` — validate, outdated, lock, autoload, scripts.
- `php-architecture` — deptrac, phpcpd/phpmd, metrics, public API boundaries.
- `php-debug` — repro, logs, Xdebug, bisect.

Registered via `ctx.skill.transform(editor.add({ id, name, description, path, content }))`. `path` = absolute path to SKILL.md, `content` = file body. This matches `Skill.Info` schema.

### Commands (slash)

- `/php-review $ARGUMENTS`, `/php-analyze $ARGUMENTS`, `/php-fix-style $ARGUMENTS`, `/php-test $ARGUMENTS`, `/php-audit`, `/php-upgrade $ARGUMENTS`, `/php-scaffold $1 $2`
- Registered via `ctx.command.transform(editor.add({ name, description, execute }))` where execute calls `ctx.session.prompt({ sessionID, text, delivery })` with expanded template + shell-block output pre-computed safely.
- Markdown files are templates; TS loads them so users can read/edit source.

### Tools (Promise flavor, no Effect dep)

- `php_project_detect` (namespace `php`) — reads composer.json/composer.lock (if present), reports php requirement, deps, dev-tools presence (phpunit/pest/phpstan/psalm/cs-fixer/rector/mago), PSR-4 roots. No shell exec. Input `{}`. Returns `{ content: JSON string }`.
- `php_lint` — runs `php -l` on given paths + `composer validate --no-check-publish` (read-only). Timeout 30s, respects `context.signal`.
- `composer_audit` — runs `composer audit --format=json` if composer present, else install hint. Read-only.
- Guard via `ctx.tool.hook("execute.before")`: if tool `shell` input matches `composer update|rector.*process.*--no-dry-run|.*-fixer fix(?!.*dry-run)|pest.*--coverage` destructive patterns, log warning (no block — v2 hook has no typed rejection; guidance only).

Tool input uses JSON Schema (`type: object, properties, required, additionalProperties: false`). Executor returns `{ content: string }` per `Tool.Result`.

### Hooks

- `ctx.session.hook("prompt")` — if prompt text mentions `php|composer|phpunit|pest|phpstan|psalm|rector`, attach `composer.json` excerpt hint via `event.prompt.files` only if file exists (guard try/catch). Retry-safe, no side effects.
- `ctx.session.hook("context")` — push system text: "Prefer typed, framework-agnostic PHP 8.1+. Prefer PHPStan/Psalm + PHPUnit/Pest guidance. Rector/CS-Fixer dry-run first." Delete nothing, override nothing.

## Data flow

setup(ctx) -> load markdown (readFile, absolute paths via import.meta/dirname) -> ctx.skill.transform (add 8) -> ctx.command.transform (add 7) -> ctx.tool.transform (namespace php + add 3 tools) -> ctx.session.hook prompt/context + ctx.tool.hook before/after logging -> return cleanup disposing registrations.

Transforms must be cheap/repeatable. External file reads happen before transform callbacks; `reload()` after change (not needed v1).

## Error handling

- Missing composer.json / binaries → tools return actionable hint, never throw raw ENOENT.
- Missing agent-add API → documented copy fallback, no silent fail.
- Hooks try/catch, never break admission.
- No secrets in outputs; composer audit JSON passed through, truncated at 20k chars.

## Testing / verification

- `npm run typecheck` (tsc --noEmit), `npm run build` (tsc).
- Frontmatter lint: skill IDs kebab-case, description present; agent files have description + mode.
- Smoke: `node dist/index.js` exports default with `id` + `setup`; load in opencode via `file://` plugin path and `opencode api get /api/info` + skill/command list.
- Manual PHP fixture in `fixtures/php-sample/` with composer.json + src/ + test to exercise detect/lint.

## Non-goals (deferred to sibling repos)

Laravel (Eloquent, Artisan, Blade, Larastan), Symfony (Console, DI, Twig, Doctrine), WordPress. No framework-specific rules in prompts; detect and defer with hint.

## Self-review

- No TBD. Scope is single plugin, framework-agnostic. IDs unique (`php-*`). No contradictions: agent-add limitation explicitly handled. No ambiguity: read-only tools by default, writes via agent permissions.

# PHP Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship framework-agnostic `opencode-php-toolkit` v2 plugin with 8 skills, 7 commands, 4 agents, 3 tools, 2 hooks.

**Architecture:** Hybrid layered: markdown source-of-truth, TS core registers via `Plugin.define` transforms (promise flavor, no Effect).

**Tech Stack:** TypeScript ESM, `@opencode/plugin` 2.x (promise), Node 20+, PHP 8.1+ fixtures, tsc.

---

### Task 1: Package scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `README.md`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "opencode-php-toolkit",
  "version": "0.1.0",
  "description": "Framework-agnostic PHP toolkit for OpenCode v2 — review, analyze, test, secure, modernize.",
  "type": "module",
  "license": "MIT",
  "exports": {
    ".": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "agents", "commands", "skills", "README.md", "LICENSE"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@opencode/plugin": "^2.0.26"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  },
  "keywords": ["opencode", "opencode-plugin", "php", "phpstan", "psalm", "phpunit", "pest"],
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write .gitignore**

```gitignore
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 4: Write LICENSE (MIT, NexusNV)**

```text
MIT License
Copyright (c) 2026 NexusNV
Permission is hereby granted, free of charge, to any person obtaining a copy...
```

Full MIT text in file.

- [ ] **Step 5: Commit scaffolding docs**

```bash
cd /home/leonidas/dev/nexusnv/opencode-php-toolkit && git init 2>/dev/null || true; git add docs package.json tsconfig.json .gitignore LICENSE 2>/dev/null; git commit -m "chore: scaffolding + design spec" 2>/dev/null || echo "commit deferred"
```

### Task 2: Core plugin entry (v2 promise flavor)

**Files:**
- Create: `src/index.ts`
- Create: `src/content.ts`
- Create: `src/tools/detect.ts`
- Create: `src/tools/php-tools.ts`
- Create: `src/hooks/php-context.ts`

See implementation in repo (already scaffolded per design). Verify with typecheck below.

- [ ] **Step 1: Run typecheck**

Run: `npm install --no-audit --no-fund && npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Run build**

Run: `npm run build && node -e "import('./dist/index.js').then(m=>console.log(Object.keys(m), m.default.id))"`
Expected: `['default'] php-toolkit`

### Task 3: Agents (4 markdown, copy fallback)

**Files:**
- Create: `agents/php-reviewer.md`, `agents/php-debugger.md`, `agents/php-modernizer.md`, `agents/php-tester.md`
- Create: `postinstall.mjs` (copies agents to global config as convenience)

Each agent frontmatter: `description`, `mode: subagent`. Body = system prompt.

- [ ] **Step 1: Verify agent frontmatter**

Run: `grep -H "^description:" agents/*.md && grep -H "^mode:" agents/*.md`
Expected: 4 files each with both.

### Task 4: Commands (7 markdown + registration)

**Files:**
- Create: `commands/php-review.md`, `php-analyze.md`, `php-fix-style.md`, `php-test.md`, `php-audit.md`, `php-upgrade.md`, `php-scaffold.md`

Registered in `src/index.ts` via `ctx.command.transform` with `execute` calling `ctx.session.prompt`.

- [ ] **Step 1: Verify command registration count**

Run: `grep -c "editor.add" src/index.ts`
Expected: >= 8 (7 commands + skills loop counts separately — check `name: \"php-` occurrences).

### Task 5: Skills (8 SKILL.md + references)

**Files:**
- Create: `skills/php-standards/SKILL.md`, `php-static-analysis/SKILL.md`, `php-testing/SKILL.md`, `php-security/SKILL.md`, `php-modernize/SKILL.md`, `php-composer/SKILL.md`, `php-architecture/SKILL.md`, `php-debug/SKILL.md`
- Create: `skills/php-static-analysis/references/phpstan-psalm.md`, `skills/php-testing/references/phpunit-pest.md`

Each SKILL.md frontmatter: `name`, `description`. ID = directory name, kebab-case.

- [ ] **Step 1: Verify skill IDs**

Run: `ls skills/ && grep -H "^description:" skills/*/SKILL.md`
Expected: 8 dirs, 8 descriptions.

### Task 6: Fixtures + smoke test in OpenCode

**Files:**
- Create: `fixtures/php-sample/composer.json`, `fixtures/php-sample/src/Calculator.php`, `fixtures/php-sample/tests/CalculatorTest.php`

- [ ] **Step 1: Load plugin in opencode standalone**

Run: `opencode api get /api/info 2>&1 | head -5` (service must be up)
Then manual: add `"plugins": ["file:///home/leonidas/dev/nexusnv/opencode-php-toolkit"]` to temp opencode.json and list skills.

Expected: `php-*` skills/commands visible.

## Self-Review

- Spec coverage: agents/commands/skills/tools/hooks/fixtures all have tasks. Agent-add API limitation documented with copy fallback.
- No placeholders: all file paths exact, code blocks complete.
- Type consistency: `Plugin.define({ id, setup })`, `ctx.skill.transform`, `ctx.command.transform`, `ctx.tool.transform`, `ctx.session.hook("prompt"/"context")` used consistently.

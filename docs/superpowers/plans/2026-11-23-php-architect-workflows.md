# PHP Architect Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the `php-architect` agent and the `/php-design` and `/php-architect` commands from reactive-engineering phase 4.

**Architecture:** Markdown remains the source of truth for agent and command instructions. `src/content.ts` and the existing command transform register both commands; `postinstall.mjs` copies the one new agent without overwriting a customized copy. Existing status output already reports verification and routing state; scanner status is added in the scanner plan after scan state exists.

**Tech Stack:** TypeScript, OpenCode v2 plugin transforms, Markdown agent/command files, Node.js postinstall helper, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-php-architect-and-configured-verification-design.md`, Architect workflows section; `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md`, section 9; roadmap phase 4.

## Global Constraints

- Keep the toolkit framework-agnostic and preserve existing skill, command, tool, and agent IDs.
- Add only one specialist agent: `php-architect`.
- `/php-design` proceeds for non-significant changes when implementation was requested; `/php-architect` always waits for approval.
- Agent copy never overwrites an existing destination; `PHP_TOOLKIT_SKIP_AGENT_COPY=1` still disables copying.
- Keep Markdown as source of truth and rebuild committed `dist/` for TypeScript changes.

## Review Focus

- A customized global `php-architect.md` must survive reinstall; test existing destination is unchanged.
- The skip-copy environment option must still skip all copies; test with `PHP_TOOLKIT_SKIP_AGENT_COPY=1`.
- `/php-design` and `/php-architect` must retain different approval behavior; assert both command descriptions/templates state the correct policy.
- Registration failures must follow existing command-transform error handling; assert both commands register through the normal manifest path.
- Existing status output must continue to show verification state after the new commands are added; retain the existing status test expectation.

---

### Task 1: Author the Architect agent and commands

**Files:**
- Create: `agents/php-architect.md`
- Create: `commands/php-design.md`
- Create: `commands/php-architect.md`
- Modify: `src/content.ts:51-60`
- Test: `test/plugin-integration.test.ts`

**Interfaces:**
- Consumes: existing `COMMAND_DEFS` entries and Markdown loader in `src/index.ts`.
- Produces: command IDs `php-design` and `php-architect`, plus the `php-architect` agent prompt file.

- [ ] **Step 1: Add integration assertions**

Add tests asserting both command IDs are registered from `COMMAND_DEFS`, their descriptions distinguish fluid design from approval-gated architecture, and the agent file is present in the package source.

- [ ] **Step 2: Run the focused integration test and confirm failure**

Run: `npm test -- --run test/plugin-integration.test.ts`
Expected: FAIL because the command definitions and files are not present.

- [ ] **Step 3: Add the Markdown content and manifests**

Define the agent as read-only while preparing a design, with options, trade-offs, recommendation, affected boundaries, and test strategy. Add `/php-design` with risk-based flow and `/php-architect` with an unconditional approval stop. Add both entries to `COMMAND_DEFS` using the existing command template format.

- [ ] **Step 4: Re-run the focused integration test**

Run: `npm test -- --run test/plugin-integration.test.ts`
Expected: PASS and both commands appear in the fake plugin context.

### Task 2: Install the Architect agent safely

**Files:**
- Modify: `postinstall.mjs:26-31`
- Test: `test/postinstall.test.ts` (new)

**Interfaces:**
- Consumes: `agents/php-architect.md` from Task 1.
- Produces: non-overwriting copy behavior for the fifth bundled agent.

- [ ] **Step 1: Add postinstall behavior tests**

Run the script in a child process with an isolated temporary home. Assert it copies `php-architect.md`, keeps a pre-existing customized file byte-for-byte, and honors `PHP_TOOLKIT_SKIP_AGENT_COPY=1`.

- [ ] **Step 2: Run the focused postinstall test and confirm failure**

Run: `npm test -- --run test/postinstall.test.ts`
Expected: FAIL because `php-architect.md` is not in the copy list.

- [ ] **Step 3: Add the new agent to the copy list**

Append `agents/php-architect.md` to the existing `files` list without changing overwrite or skip semantics.

- [ ] **Step 4: Re-run the focused postinstall test**

Run: `npm test -- --run test/postinstall.test.ts`
Expected: PASS for copy, preservation, and skip cases.

### Task 3: Document the phase and package surface

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md`
- Test: `test/plugin-integration.test.ts`

**Interfaces:**
- Consumes: command and agent surfaces from Tasks 1–2.
- Produces: user-facing installation, behavior, and release notes.

- [ ] **Step 1: Add assertions for published agent packaging**

Assert `agents/php-architect.md` is covered by the existing package `files` rule and the README agent count/list includes it.

- [ ] **Step 2: Run the focused integration test and confirm failure**

Run: `npm test -- --run test/plugin-integration.test.ts`
Expected: FAIL on the outdated four-agent documentation assertion.

- [ ] **Step 3: Update README, changelog, and roadmap**

Document the agent copy/opt-out and both command contracts; mark only phase 4 acceptance items completed after their tests pass. Keep phase 5 scan-state work for the scanner plan.

- [ ] **Step 4: Re-run the focused integration test**

Run: `npm test -- --run test/plugin-integration.test.ts`
Expected: PASS with all four existing agents and the new agent represented.

### Final verification

- [ ] Run `npm run typecheck` and `npm test -- --run test/plugin-integration.test.ts test/postinstall.test.ts test/toolkit-status.test.ts`.
- [ ] Run `npm run build`, verify generated `dist/` matches the source, and run `npm pack --dry-run`.
- [ ] Confirm `git diff --check` is clean and update phase 4 checkboxes only for completed criteria.

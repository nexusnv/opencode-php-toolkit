# Project-Aware PHP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `php_verify` honor explicitly mapped Composer quality scripts and surface useful Composer/CI conventions for more PHP project layouts.

**Architecture:** Project discovery carries script names and bounded CI metadata into `ProjectProfile`. The shared `php-toolkit.json` validator accepts `verification.composerScripts`; mappings override only requested checks, run as whole-project checks through the permission-aware runner, and are never auto-run. CI commands are advisory metadata and are never executed.

**Tech Stack:** TypeScript, Composer JSON, bounded YAML text inspection without a YAML dependency, existing `CommandRunner` and verification adapters, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-php-architect-and-configured-verification-design.md`, Composer scripts and CI conventions section; `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md`, section 10.

## Global Constraints

- Preserve existing `php_verify` check IDs and default behavior when no mappings are configured.
- Accept only `tests`, `static`, and `style` mapping keys; each mapped script must exist in the root Composer manifest.
- Run mapped scripts only for an explicitly requested check; never run them from prompt hooks or as automatic defaults.
- Invoke only `composer run-script --no-interaction <name>` through the existing permission-aware, cancellable command runner; never parse or execute CI commands.
- Treat mapped scripts as arbitrary project code. They are whole-project checks and may have side effects; document that clearly.
- CI discovery is bounded/read-only and reports provider presence, recognizable PHP version matrix values, and known quality tool names only; do not persist or emit full config contents.
- Add no dependencies and rebuild committed `dist/` for source changes.

## Review Focus

- An invalid check key, absent Composer script, malformed mapping, or malformed manifest must be diagnosed and must not trigger execution; test each shape.
- A mapped script must not run when its check is omitted from explicit `checks`; test default verification and explicit selection.
- Changed scope must not pass source paths to a whole-project Composer script; test report semantics and exact runner args.
- A mapped command denied or approval-gated by host permissions must be reported as cancelled and never spawned; test deny/ask rules.
- CI YAML containing arbitrary shell, secrets, anchors, or unrecognized providers must never be executed or copied to status/model context; test safe summaries and absent raw content.

---

### Task 1: Extend project config and Composer profile metadata

**Files:**
- Modify: `src/project-config.ts` (created by the architecture scanner plan)
- Modify: `src/tools/detect.ts`
- Modify: `src/profile.ts`
- Test: `test/project-config.test.ts`
- Test: `test/detect.test.ts`
- Test: `test/profile.test.ts`

**Interfaces:**
- Consumes: `readProjectToolkitConfig(root)` and normalized project config result from the architecture scanner plan.
- Produces: profile fields for Composer script names/definitions, validated `verification.composerScripts`, and bounded CI convention metadata.

- [ ] **Step 1: Add config/profile tests**

Cover mapping to existing `test`, `analyse`, and `cs-check` scripts; reject unsupported check keys, missing names, and names absent from `composer.json`; confirm script bodies do not appear in profile summaries. Add fixture cases for common CI manifests and safe PHP version/tool extraction.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run test/project-config.test.ts test/detect.test.ts test/profile.test.ts`
Expected: FAIL because verification mappings and CI metadata are not read into the profile.

- [ ] **Step 3: Extend the shared config validator**

Add `verification.composerScripts` as a map from `tests | static | style` to Composer script names. Validate the target script exists in the root `composer.json`; return stable diagnostics and disable invalid mappings. Preserve valid architecture config when only verification config is invalid, and vice versa.

- [ ] **Step 4: Add bounded discovery metadata**

Carry only script names and known command/tool tokens from Composer data. Detect supported CI files (`.github/workflows/*.yml`, `.gitlab-ci.yml`, `.circleci/config.yml`, `bitbucket-pipelines.yml`, and `azure-pipelines.yml`) and extract only recognizable PHP version matrix values and known quality-tool names; do not retain full file text in profile or storage.

- [ ] **Step 5: Re-run focused tests**

Run: `npm test -- --run test/project-config.test.ts test/detect.test.ts test/profile.test.ts`
Expected: PASS; raw Composer script bodies and CI YAML are absent from normalized summaries.

### Task 2: Execute explicit mapped scripts through verification

**Files:**
- Create: `src/verify/checks/composer-script.ts`
- Modify: `src/verify/checks/shared.ts`
- Modify: `src/verify/verify.ts`
- Modify: `src/verify/types.ts`
- Test: `test/verify-checks-composer-script.test.ts` (new)
- Test: `test/verify.test.ts`
- Test: `test/verify-permissions.test.ts`

**Interfaces:**
- Produces: `composerScriptCheck(env, check, scriptName): Promise<CheckResult>` using the existing root, runner, signal, permission status, and bounded output conventions.
- Consumes: validated profile mapping; no new verification check IDs.

- [ ] **Step 1: Add adapter and orchestration tests**

Assert exact invocation `composer run-script --no-interaction <name>` from project root, pass/fail mapping from exit code, timeout/abort/missing Composer/permission outcomes, bounded output, no arguments derived from CI, whole-project changed-scope messaging, and no mapped-script execution unless explicitly requested in `checks`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run test/verify-checks-composer-script.test.ts test/verify.test.ts test/verify-permissions.test.ts`
Expected: FAIL because mapped scripts are not integrated into verification.

- [ ] **Step 3: Implement the script check adapter**

Use the existing `CommandRunner` and failure normalization helpers. Do not use a shell, pass changed paths, infer a command from script body, or interpret a failing script as a countable finding. Report that the script is project-defined arbitrary code and runs as a whole-project check.

- [ ] **Step 4: Wire mappings into explicit check selection**

When a caller explicitly includes `tests`, `static`, or `style` in `checks`, use its configured script mapping in place of that adapter. When checks are omitted, retain existing detection/default behavior and do not invoke custom mappings. Keep `scope: changed` but label the mapped check `whole-project-script` and avoid implying incremental coverage.

- [ ] **Step 5: Re-run focused tests**

Run: `npm test -- --run test/verify-checks-composer-script.test.ts test/verify.test.ts test/verify-permissions.test.ts`
Expected: PASS, including ask/deny outcomes and non-execution in default verification.

### Task 3: Surface project conventions and document safe use

**Files:**
- Modify: `src/tools/detect.ts`
- Modify: `src/status/toolkit-status.ts`
- Modify: `src/verify/report.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Test: `test/detect.test.ts`
- Test: `test/toolkit-status.test.ts`
- Test: `test/verify-report.test.ts`

**Interfaces:**
- Consumes: normalized Composer/CI metadata and script check result from Tasks 1–2.
- Produces: safe diagnostics identifying configured checks and CI conventions without exposing script bodies or CI content.

- [ ] **Step 1: Add status/report tests**

Assert status shows mapped check names and CI provider/version summaries only; verification report explains whole-project script semantics and side effects; no raw script or YAML content is present.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run test/toolkit-status.test.ts test/verify-report.test.ts`
Expected: FAIL on missing convention and script-check rendering.

- [ ] **Step 3: Implement summary rendering and docs**

Render only normalized names/counts and safe values. Document `php-toolkit.json` mappings, explicit check selection, whole-project behavior, arbitrary project-code side effects, permission reporting, supported CI metadata, and that CI commands are never run. Update README tool descriptions and changelog.

- [ ] **Step 4: Re-run focused tests**

Run: `npm test -- --run test/toolkit-status.test.ts test/verify-report.test.ts`
Expected: PASS without raw command/config contents in output.

### Final verification

- [x] Run `npm run typecheck` and focused config/detection/verification tests.
- [x] Run `npm test` after focused checks pass.
- [x] Run `npm run build`, verify `dist/` synchronization, and run `npm pack --dry-run`.
- [x] Inspect report output for default checks, explicitly mapped checks, invalid config, permission denial, and whole-project changed-scope behavior.
- [x] Run `git diff --check` and ensure no CI command or config body is persisted.

# PHP Architecture Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded, read-only PHP architecture scanner with explicit boundary validation and integrate it with `php_architecture_scan`, `php_verify`, and status diagnostics.

**Architecture:** The PHP scanner is a dependency-free CLI using `token_get_all`; TypeScript validates project configuration, invokes it through the existing `CommandRunner`, normalizes findings, and caches by project/config/content identity. Only declared `php-toolkit.json` layers produce dependency violations; structural observations and heuristics remain clearly distinct.

**Tech Stack:** PHP 8.1+, PHP token API, TypeScript, OpenCode v2 tool registration, existing runner/storage APIs, Vitest, PHP CLI for scanner fixtures.

**Spec:** `docs/superpowers/specs/2026-11-23-php-architect-and-configured-verification-design.md`, Architecture scanner section; `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md`, sections 10–11; roadmap phase 5.

## Global Constraints

- The scanner uses built-in `token_get_all`; add no Composer or npm dependency.
- It performs no writes and no network access; default cap is 500 PHP files and timeout is 20 seconds.
- Without valid explicit layers, report structure/metrics only and never infer a layer violation.
- Distinguish `finding`, `hypothesis`, and `metric`; mark heuristics as suggestions.
- Cache keys include project/worktree, scanner/toolkit versions, config, Composer lock, and file fingerprints; metadata-only mode is best-effort.
- `architectureScan: "tool"` is default and on-demand; `"auto"` remains opt-in; `"off"` disables the scanner.
- Keep command execution permission-aware, bounded, cancellable, and reflected in the report; rebuild committed `dist/`.

## Review Focus

- Malformed or wrong-shaped `php-toolkit.json` must disable boundary checks with a clear diagnostic; test invalid layer names, namespace prefixes, and dependency references.
- PHP strings/comments containing class-like tokens must not create false imports or declarations; test scanner fixtures with misleading text and anonymous classes.
- Excluded/vendor paths and a file list beyond `maxFiles` must not escape bounds; test configured excludes and truncation.
- Cache hits must not cross roots/worktrees and must invalidate on source, config, lock, or toolkit version change; test each key component.
- Missing PHP, permission denial, timeout, and abort must produce normalized unavailable/cancelled/timed-out states without a false clean result; test runner outcomes.

---

### Task 1: Define the project config contract and validator

**Files:**
- Create: `src/project-config.ts`
- Modify: `src/profile.ts`
- Test: `test/project-config.test.ts` (new)
- Test: `test/profile.test.ts`

**Interfaces:**
- Produces: `ProjectToolkitConfig` and `readProjectToolkitConfig(root): Promise<ProjectToolkitConfigResult>` with validated architecture layers, excludes, and diagnostics.
- Later scanner and verification tasks consume this normalized result from `ProjectProfile`.

- [ ] **Step 1: Add validator tests**

Cover valid layers, namespace prefixes, allowed references, excludes, missing config, malformed JSON, unknown fields, duplicate layer namespaces, invalid dependencies, and invalid `verification` section diagnostics without executing any command.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run test/project-config.test.ts test/profile.test.ts`
Expected: FAIL because the project config reader is not defined.

- [ ] **Step 3: Implement the normalized config reader**

Define the `architecture.layers` and `architecture.exclude` schema in `src/project-config.ts`; validate `mayDependOn` references against declared layers. Preserve the already specified `routing.disableSkills` and `routing.extraSkills` keys. Return diagnostics rather than guessing. Leave the `verification` mapping shape to Task 1 in the project-aware verification plan, preserving a single shared parser interface.

- [ ] **Step 4: Attach the config result to project profiles**

Extend `ProjectProfile` and `buildProjectProfile` to load `php-toolkit.json`. Include the file in content fingerprinting so edits invalidate profile/cache state.

- [ ] **Step 5: Re-run focused tests**

Run: `npm test -- --run test/project-config.test.ts test/profile.test.ts`
Expected: PASS, with malformed config reported and no inferred boundaries.

### Task 2: Implement the PHP scanner CLI

**Files:**
- Create: `scripts/architecture-scan.php`
- Create: `fixtures/php-architecture/` scanner fixtures
- Modify: `package.json` (include `scripts/` in published files)
- Test: `test/architecture-scan-cli.test.ts` (new)
- Modify: `.github/workflows/ci.yml` (ensure a supported PHP CLI is present for scanner tests)

**Interfaces:**
- Produces: CLI contract `php scripts/architecture-scan.php --directory <dir> --format json [--max-files N]` returning JSON with `kind`, severity, file, line, message, evidence, candidate patterns, and confidence.
- Consumes only the validated configuration produced by Task 1; scanner itself also validates the raw config for direct CLI invocation.

- [ ] **Step 1: Add CLI contract fixtures and tests**

Assert declarations/import relationships and metrics, configured-layer dependency findings, and these hypotheses: `instanceof` chains or `switch`/`match` with at least 3 branches; singleton/static access; constructors over 4 parameters; classes over 15 public methods; classes over 400 LOC; methods over 50 LOC. Also test exclusions, malformed config behavior, deterministic ordering, and `maxFiles` truncation.

- [ ] **Step 2: Run focused CLI tests and confirm failure**

Run: `npm test -- --run test/architecture-scan-cli.test.ts`
Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement bounded token scanning**

Use `token_get_all` and track namespaces, imports, class/interface/trait/enum declarations, methods, constructors, branch counts, static access, and line numbers. Ignore comments and string bodies. Emit structure and metrics as `metric`, configured boundary violations as `finding`, and all threshold-based patterns as `hypothesis` with candidate patterns and confidence. Exclude `vendor`, `node_modules`, `.git`, `var`, `storage`, plus validated configured excludes. Emit JSON only; no writes or network. Add `scripts/` to `package.json`'s published files so git/npm installs can invoke the scanner.

- [ ] **Step 4: Make CI provide PHP and rerun CLI tests**

Add a PHP 8.1+ CLI setup to the existing Node CI job or a dedicated scanner job; keep Node 20 compatibility job free of scanner tests if it does not install PHP.

Run: `npm test -- --run test/architecture-scan-cli.test.ts`
Expected: PASS on the committed fixture matrix.

### Task 3: Add the TypeScript scanner adapter and cache

**Files:**
- Create: `src/architecture/scanner.ts`
- Create: `src/architecture/cache.ts`
- Modify: `src/profile.ts`
- Test: `test/architecture-scanner.test.ts` (new)
- Test: `test/architecture-cache.test.ts` (new)

**Interfaces:**
- Produces: `scanArchitecture(root, profile, options): Promise<ArchitectureScanResult>` with normalized JSON findings, cache mode, truncation, and error details.
- Consumes: `execFileRunner`/`CommandRunner`, `AbortSignal`, profile config and lock fingerprints, `ctx.storage` injection from the tool registration.

- [ ] **Step 1: Add adapter/cache contract tests**

Use a scripted runner to assert exact PHP arguments, root, 20-second timeout, cancellation, JSON validation, output cap, cache key isolation, content/config/lock/toolkit invalidation, and metadata-only cache labeling for files over 1 MB.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run test/architecture-scanner.test.ts test/architecture-cache.test.ts`
Expected: FAIL because the adapter and cache are not defined.

- [ ] **Step 3: Implement cache key and bounded adapter**

Fingerprint sorted PHP file paths/content up to 1 MB, use path/size/mtime and set `cacheMode: "metadata"` for larger files, include project root/subpath, scanner/toolkit versions, config and Composer lock, and cache in memory plus storage. Run the CLI only through the injected command runner and validate its JSON before returning.

- [ ] **Step 4: Re-run focused tests**

Run: `npm test -- --run test/architecture-scanner.test.ts test/architecture-cache.test.ts`
Expected: PASS, including no cross-root cache reuse and explicit metadata mode.

### Task 4: Register `php_architecture_scan` and scanner state

**Files:**
- Modify: `src/index.ts`
- Modify: `src/config.ts`
- Modify: `src/status/toolkit-status.ts`
- Modify: `src/metrics/store.ts`
- Modify: `src/metrics/format.ts`
- Test: `test/plugin-integration.test.ts`
- Test: `test/config.test.ts`
- Test: `test/toolkit-status.test.ts`
- Test: `test/metrics-verification.test.ts`

**Interfaces:**
- Produces: tool `php_architecture_scan` with explicit root, `maxFiles`, and optional cache control inputs; scanner metric summary contains timestamps/status/counts only, never source or finding evidence.
- Consumes: `architectureScan` config with `tool`/`auto`/`off` values and Task 3 adapter/cache.

- [ ] **Step 1: Add registration, config, metrics, and status tests**

Assert tool mode registers on default, off removes it, auto remains opt-in and bounded, status/metrics show last scan status, and persisted metrics contain no paths or evidence. Reuse the existing `ScannerMetrics` fields rather than creating a parallel store; add only missing last-status/recording support.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run test/plugin-integration.test.ts test/config.test.ts test/toolkit-status.test.ts test/metrics-verification.test.ts`
Expected: FAIL on the missing tool and scan status fields.

- [ ] **Step 3: Register tool and wire scan summary**

Use the existing tool transform, command-permission adapter, project-scoped storage, and metrics patterns. Honor `off`; default to an on-demand tool. For `auto`, scan only high-confidence Design tasks with a 2-second budget and inject only summary kinds/counts into model context; full findings remain tool output.

- [ ] **Step 4: Re-run focused tests**

Run: `npm test -- --run test/plugin-integration.test.ts test/config.test.ts test/toolkit-status.test.ts test/metrics-verification.test.ts`
Expected: PASS for tool registration, opt-out/default behavior, and privacy-safe scan status.

### Task 5: Integrate architecture verification and documentation

**Files:**
- Modify: `src/verify/checks/architecture.ts`
- Modify: `src/verify/verify.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md`
- Test: `test/verify-checks-tools.test.ts`
- Test: `test/verify.test.ts`

**Interfaces:**
- Consumes: scanner adapter from Task 3 and verified layers from Task 1.
- Produces: `php_verify` architecture result from the scanner when boundaries are configured; retains Deptrac when configured and `scanner-unavailable` when neither is usable.

- [ ] **Step 1: Add architecture adapter tests**

Assert valid configured boundaries invoke the scanner, no boundaries do not report violations, invalid boundaries return a clear partial/skipped diagnostic, Deptrac still runs when configured, and scanner failure never reports passed.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run test/verify-checks-tools.test.ts test/verify.test.ts`
Expected: FAIL because the architecture adapter still only supports Deptrac.

- [ ] **Step 3: Wire scanner into architecture verification**

Select the scanner adapter only for valid explicit boundaries, preserve existing Deptrac detection/runner behavior, and normalize findings/hypotheses without promoting suggestions to violations.

- [ ] **Step 4: Document scanner tool, config, privacy, and controls**

Add the root `php-toolkit.json` schema and examples, limits/cache semantics, scan modes, remote-provider context note for auto summaries, tool side effects, and verification behavior to README/changelog. Mark phase 5 roadmap acceptance items only after their corresponding checks pass.

- [ ] **Step 5: Re-run focused tests**

Run: `npm test -- --run test/verify-checks-tools.test.ts test/verify.test.ts`
Expected: PASS; configured violations are detected and unconfigured projects have no guessed boundaries.

### Final verification

- [x] Run `npm run typecheck` and focused scanner/verification tests.
- [x] Run `npm test` after focused checks pass.
- [x] Run `npm run build`; ensure `dist/` is synchronized, and confirm `npm pack --dry-run` includes `scripts/architecture-scan.php` but excludes test fixtures.
- [x] Run scanner CLI against `fixtures/php-architecture/` with PHP 8.1+ and check bounded JSON output.
- [x] Run `git diff --check`; update phase 5 checkboxes only for completed criteria.

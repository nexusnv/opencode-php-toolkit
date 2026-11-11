# Reactive Engineering Phase 3 Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `php_verify` from `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md` §10: a non-mutating verification orchestrator with lint, composer, tests, static analysis, style and architecture checks, host-permission-aware execution, deterministic statuses, changed-scope test mapping, verification metrics, the completion reminder, and the `/php-toolkit-status` verification line.

**Architecture:** A new `src/verify/` module owns verification types, changed-scope normalization, production-to-test mapping, the permission-aware runner adapter, per-check adapters, deterministic aggregation/rendering and the `phpVerify` orchestrator. Existing parsing in `src/tools/php-tools.ts` stays authoritative: the process runner is extracted to `src/tools/runner.ts`, and the existing check functions accept an injected runner plus explicit paths without changing their registered tool inputs. `src/index.ts` wires `php_verify` to the session root, `ctx.vcs.status`, the session permission snapshot and verification metrics. The state part adds the Build/Design/Test completion reminder, gated by the already-parsed `verification` option.

**Tech Stack:** TypeScript ESM, `@opencode/plugin@2.0.26` (`ctx.vcs.status`, `ctx.session.get`, `ctx.tool.transform`), Node 20+, Vitest, fake binaries and injected fake runners.

---

## Phase boundary

Included:

- `php_verify` tool with `directory`, `scope`, `checks` and `paths` input.
- `lint`, `composer`, `tests`, `static`, `style` and `architecture` checks.
- VCS-derived changed scope through `ctx.vcs.status`, including deleted-file, empty-list and VCS-unavailable semantics.
- Production-to-test mapping with bounded search and an explicit full-suite fallback.
- `CommandRunner` extraction and a command/shell permission gate (`deny` / `ask` / tool-level-only).
- Per-check and aggregate statuses exactly as spec §10.1.
- Verification metrics in the existing metrics v3 document, plus the `php_metrics` and `/php-toolkit-status` views.
- Build/Design/Test completion reminder, gated by `verification: "remind" | "off"`.
- Documentation, `0.4.0` version bump, rebuilt `dist/`.

Excluded (do not implement here):

- Phase 5 architecture scanner. `php_verify` runs Deptrac only when a Deptrac config exists; otherwise the architecture check is `skipped: scanner-unavailable`, even when `php-toolkit.json` declares boundaries.
- Network checks (`composer audit`, `composer outdated`) inside `php_verify`; they stay separate tools.
- Auto-run verification, blocking the final response, or rewriting prompts.
- Mutation: `php_verify` never installs dependencies, edits configuration, or applies fixes.
- P1 pattern skills, the `php-architect` agent, `/php-design`, `/php-architect` (later phases).

Roadmap exit gate mapping (Phase 3):

- Never passes production paths as test paths → Task 4 + Task 7 tests.
- Never passes when changed scope cannot be determined → Task 3 + Task 7 aggregate tests.
- Never installs tools or edits configuration → adapters are detect-only; no install/fix commands, style always dry-run.
- Denied commands are reported as cancelled/unavailable, never bypassed → Task 1 gate tests assert the base runner is not called.
- Deptrac only when configured; otherwise `skipped: scanner-unavailable` → Task 6.
- Build/Design/Test tasks receive the completion reminder → Task 9.
- Evaluation shows improved completion reporting → Task 11 manual acceptance on fixtures.

## Source references

- `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md` §10.1 (tool input, checks table, scope semantics, test selection, statuses, output shape), §10.2 (completion reminder), §10.3 (integration and execution adapter), §12 (tool surface), §13 (`verification` option), §14 (metrics and status), §15 (unit/integration tests), §16 (Phase 3 deliverables and exit gate).
- `docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md` §5 Phase 3.
- Existing tool implementations: `src/tools/php-tools.ts` (`phpLint`, `composerValidate`, `phpStaticAnalysis`, `phpTest`), `src/tools/detect.ts`, `src/profile.ts` (`ProjectProfile`, `ProjectProfileCache`).
- Host APIs: `@opencode/plugin/dist/promise/vcs.d.ts` (`Vcs.StatusOutput` = `{ location, data: { file, additions, deletions, status }[] }`), `@opencode/plugin/dist/promise/plugin.d.ts` (`ctx.vcs`), `@opencode/schema/dist/session.d.ts` (`permissions: { action, resource, effect }[]`).
- Existing permission interpreter: `src/routing/permissions.ts` (`PermissionRule`, glob semantics, last matching rule wins).

## File structure

### Create

- `src/util/glob.ts` — shared glob matcher (`globMatches`) used by skill and command permission rules.
- `src/tools/runner.ts` — `RunResult`, `CommandRunner`, `execFileRunner`, `authorizedRunner`, permission decision codes, `isMissingBinary`, `MAX_REPORT_BUFFER`.
- `src/verify/types.ts` — `VERIFICATION_CHECKS`, `VerificationCheck`, `CheckStatus`, `AggregateStatus`, `CheckResult`, `VerificationReport`, stable reason codes.
- `src/verify/aggregate.ts` — `aggregateStatus`, per-status counters, findings total.
- `src/verify/report.ts` — deterministic report rendering, icon/label table, 24,000-character cap.
- `src/verify/changed.ts` — VCS status normalization, root/path validation, scoped PHP file listing, file caps.
- `src/verify/test-selection.ts` — production-to-test mapping, direct test files, bounded search, full-suite fallback.
- `src/verify/permissions.ts` — command-level rule filtering and `commandDecision` for `bash`/`shell` rules.
- `src/verify/verify.ts` — `phpVerify` orchestrator, input validation, check ordering, error-report fallback.
- `src/verify/checks/shared.ts` — check environment/result helpers, `ToolOutcome`/`RunResult` to `CheckResult` mapping.
- `src/verify/checks/lint.ts` — `lint` check.
- `src/verify/checks/composer.ts` — `composer` check.
- `src/verify/checks/tests.ts` — `tests` check.
- `src/verify/checks/static.ts` — `static` check.
- `src/verify/checks/style.ts` — `style` check (CS-Fixer dry-run / PHPCS read-only).
- `src/verify/checks/architecture.ts` — `architecture` check (Deptrac only; otherwise scanner-unavailable).

### Modify

- `src/tools/php-tools.ts` — import the runner from `runner.ts`; thread an optional runner and explicit paths through `phpLint`, `composerValidate`, `phpStaticAnalysis`, `phpTest`; add structured `TestRunOutcome` for verify without changing the registered tool inputs; set `ToolOutcome.failure`.
- `src/routing/permissions.ts` — import `globMatches` from `src/util/glob.ts` (no behavior change).
- `src/metrics/store.ts` — verification delta, merge/apply, migration of the new `lastStatus` field, `recordVerification`.
- `src/metrics/format.ts` — render the verification section in `php_metrics`.
- `src/status/toolkit-status.ts` — render the `Verify:` line.
- `src/context/parts.ts` — completion reminder for Build/Design/Test when `verification` is `remind`.
- `src/config.ts` — mark `verification` active; keep `architectureScan`/`announceSelections` reserved.
- `src/index.ts` — register `php_verify`, wire VCS/session/permissions/metrics, pass the verification option to the state part, pass verification metrics to status.
- `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json` — document verification and bump to `0.4.0`.
- `docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md` — tick the Phase 3 planning row only when the plan is accepted (execution leaves checkboxes to the final task).
- `dist/` — rebuilt and committed with the source tip.

### Tests

- `test/verify-runner.test.ts` — `execFileRunner` behavior (missing binary, abort before spawn, abort during run, environment cleanup), `authorizedRunner` denies without spawning.
- `test/verify-permissions.test.ts` — allow/deny/ask, last matching rule, action globs (`bash`/`shell`), no command rules → tool-level-only.
- `test/verify-aggregate.test.ts` — status ordering and counters.
- `test/verify-report.test.ts` — output shape, reason codes, deterministic order, 24k cap.
- `test/verify-changed.test.ts` — added/modified/deleted/renamed, empty list, VCS unavailable, path override validation, outside-root rejection, caps.
- `test/verify-test-selection.test.ts` — path-preserving mapping, Unit/Feature/Integration conventions, direct test files, bounded search, full-suite fallback, deleted source, no relevant changes.
- `test/verify-checks.test.ts` — lint/composer/static adapters with a scripted fake runner.
- `test/verify-checks-tools.test.ts` — tests/style/architecture adapters, warnings, timeouts, missing tools, scanner-unavailable.
- `test/verify.test.ts` — orchestrator: scopes, requested vs detected checks, aggregate outcomes, permissions, errors, 24k output.
- `test/metrics-verification.test.ts` — recording, snapshot, persistence/merge, reset, migration.
- Update `test/context-parts.test.ts`, `test/toolkit-status.test.ts`, `test/metrics-format.test.ts`, `test/metrics-v3.test.ts`, `test/metrics-store.test.ts`, `test/plugin-integration.test.ts`.

### Conventions for every task

- Work test-first: write the failing test, run it, implement, rerun.
- Run `npm run typecheck` after each task that changes types, and `npx vitest run <file>` for the touched test file.
- Do not add dependencies. Use Node built-ins and the existing host APIs only.
- All new files use `strict_types`-equivalent typed TypeScript, explicit return types on exported functions, and `.js` import suffixes (NodeNext ESM).
- No absolute paths, prompts or file contents in metrics output.
- Commit logical units; do not rebuild `dist/` until Task 11.

---

## Task 1: Extract the command runner and the permission gate

**Goal:** Make process execution injectable and permission-aware without changing any registered tool input.

**Files:**

- Create: `src/util/glob.ts`, `src/tools/runner.ts`, `src/verify/permissions.ts`
- Modify: `src/routing/permissions.ts`, `src/tools/php-tools.ts`
- Test: `test/verify-runner.test.ts`, `test/verify-permissions.test.ts`

### Step 1: Move the glob matcher to a shared utility

Create `src/util/glob.ts` with the exact matcher currently in `src/routing/permissions.ts`:

```ts
/**
 * Glob matching for OpenCode permission rules. `*` matches any run of
 * characters and `?` matches one character; everything else is literal.
 */
export function globMatches(pattern: string, value: string): boolean {
  let source = "";
  for (const char of pattern) {
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`).test(value);
}
```

In `src/routing/permissions.ts`, delete the private `globMatches` and import it:

```ts
import { globMatches } from "../util/glob.js";
```

Run `npx vitest run test/permissions.test.ts test/permission-events.test.ts`; behavior must be unchanged.

### Step 2: Write the runner tests first

Create `test/verify-runner.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PERMISSION_APPROVAL_CODE,
  PERMISSION_DENIED_CODE,
  authorizedRunner,
  execFileRunner,
  isMissingBinary,
  type CommandRunner,
} from "../src/tools/runner.js";

const cwd = mkdtempSync(join(tmpdir(), "php-toolkit-runner-"));

describe("execFileRunner", () => {
  it("runs a command and captures stdout", async () => {
    const result = await execFileRunner.run(process.execPath, ["-e", "process.stdout.write('ok')"], cwd, 5000);
    expect(result).toMatchObject({ ok: true, stdout: "ok", killed: false, aborted: false });
  });

  it("reports a missing binary as ENOENT", async () => {
    const result = await execFileRunner.run("php-toolkit-definitely-missing", [], cwd, 5000);
    expect(result.code).toBe("ENOENT");
    expect(isMissingBinary(result)).toBe(true);
  });

  it("does not spawn when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await execFileRunner.run(process.execPath, ["-e", "process.exit(0)"], cwd, 5000, controller.signal);
    expect(result).toMatchObject({ ok: false, killed: true, aborted: true });
  });

  it("marks a timeout as killed but not aborted", async () => {
    const result = await execFileRunner.run(
      process.execPath,
      ["-e", "setTimeout(() => {}, 5000)"],
      cwd,
      50,
    );
    expect(result.killed).toBe(true);
    expect(result.aborted).toBe(false);
  });

  it("marks an aborted run as aborted", async () => {
    const controller = new AbortController();
    const pending = execFileRunner.run(
      process.execPath,
      ["-e", "setTimeout(() => {}, 5000)"],
      cwd,
      5000,
      controller.signal,
    );
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ killed: true, aborted: true });
  });
});

describe("authorizedRunner", () => {
  it("does not call the base runner when the command is denied", async () => {
    const base: CommandRunner = { run: vi.fn() };
    const runner = authorizedRunner(base, () => ({ allowed: false, reason: "permission:denied" }));
    const result = await runner.run("php", ["-l", "a.php"], cwd, 5000);
    expect(base.run).not.toHaveBeenCalled();
    expect(result.code).toBe(PERMISSION_DENIED_CODE);
  });

  it("does not call the base runner when approval is required", async () => {
    const base: CommandRunner = { run: vi.fn() };
    const runner = authorizedRunner(base, () => ({ allowed: false, reason: "permission:approval-required" }));
    const result = await runner.run("php", ["-l", "a.php"], cwd, 5000);
    expect(base.run).not.toHaveBeenCalled();
    expect(result.code).toBe(PERMISSION_APPROVAL_CODE);
  });

  it("delegates to the base runner when allowed", async () => {
    const expected = { ok: true, stdout: "", stderr: "", code: 0, killed: false, aborted: false };
    const base: CommandRunner = { run: vi.fn(async () => expected) };
    const runner = authorizedRunner(base, () => ({ allowed: true }));
    await expect(runner.run("php", ["-l", "a.php"], cwd, 5000)).resolves.toBe(expected);
    expect(base.run).toHaveBeenCalledOnce();
  });
});
```

### Step 3: Implement `src/tools/runner.ts`

```ts
import { execFile } from "node:child_process";

/** Reports (JUnit, analyzer JSON) can far exceed 1 MiB on large projects. */
export const MAX_REPORT_BUFFER = 64 * 1024 * 1024;

export const PERMISSION_DENIED_CODE = "PERMISSION_DENIED";
export const PERMISSION_APPROVAL_CODE = "PERMISSION_APPROVAL_REQUIRED";

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Exit code when the command ran, "ENOENT" when the binary is missing. */
  code: number | string | null;
  /** True when the process was killed (timeout or abort). */
  killed: boolean;
  /** True when the AbortSignal fired or was already aborted. */
  aborted: boolean;
}

export type CommandDecision =
  | { allowed: true }
  | { allowed: false; reason: "permission:denied" | "permission:approval-required" };

export type CommandAuthorizer = (
  cmd: string,
  args: readonly string[],
  cwd: string,
) => CommandDecision;

export interface CommandRunner {
  run(
    cmd: string,
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<RunResult>;
}

export const execFileRunner: CommandRunner = {
  run(cmd, args, cwd, timeoutMs, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        // An already-aborted signal never fires its abort event, so the
        // listener below would not stop the child - do not spawn at all.
        resolve({ ok: false, stdout: "", stderr: "", code: "ABORT_ERR", killed: true, aborted: true });
        return;
      }
      const child = execFile(
        cmd,
        [...args],
        { cwd, timeout: timeoutMs, maxBuffer: MAX_REPORT_BUFFER },
        (err, stdout, stderr) => {
          resolve({
            ok: !err,
            stdout: String(stdout ?? ""),
            stderr:
              typeof stderr === "string" && stderr.length > 0
                ? String(stderr)
                : String((err as Error)?.message ?? ""),
            code: (err as { code?: number | string } | null)?.code ?? null,
            killed: Boolean(
              (err as { killed?: boolean; signal?: NodeJS.Signals } | null)?.killed ||
                (err as { signal?: NodeJS.Signals } | null)?.signal,
            ),
            aborted: Boolean(signal?.aborted),
          });
        },
      );
      signal?.addEventListener("abort", () => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      });
    });
  },
};

/** Wraps a runner so every spawn passes through the session permission gate. */
export function authorizedRunner(base: CommandRunner, authorize: CommandAuthorizer): CommandRunner {
  return {
    async run(cmd, args, cwd, timeoutMs, signal) {
      const decision = authorize(cmd, args, cwd);
      if (!decision.allowed) {
        return {
          ok: false,
          stdout: "",
          stderr: decision.reason,
          code:
            decision.reason === "permission:denied"
              ? PERMISSION_DENIED_CODE
              : PERMISSION_APPROVAL_CODE,
          killed: false,
          aborted: false,
        };
      }
      return base.run(cmd, args, cwd, timeoutMs, signal);
    },
  };
}

export function isMissingBinary(result: RunResult): boolean {
  return result.code === "ENOENT" || result.stderr.includes("command not found");
}
```

### Step 4: Add the failure taxonomy and update `php-tools.ts`

At the top of `src/tools/php-tools.ts`, replace the `execFile` import and the local `RunResult`/`run` helper:

```ts
import {
  PERMISSION_APPROVAL_CODE,
  PERMISSION_DENIED_CODE,
  execFileRunner,
  isMissingBinary,
  type CommandRunner,
  type RunResult,
} from "./runner.js";

export type { RunResult } from "./runner.js";

export type ToolFailure =
  | "missing-tool"
  | "timed-out"
  | "aborted"
  | "permission-denied"
  | "permission-approval-required"
  | "execution";

export interface ToolOutcome {
  text: string;
  status: "ok" | "error";
  findings: number;
  /** Stable failure category for orchestrators; absent on success. */
  failure?: ToolFailure;
}
```

Delete the old `MAX_REPORT_BUFFER` and `run` definition. Keep `pathExists`. Add a small precedence helper:

```ts
const FAILURE_RANK: Record<ToolFailure, number> = {
  aborted: 5,
  "timed-out": 4,
  "permission-denied": 3,
  "permission-approval-required": 2,
  "missing-tool": 1,
  execution: 0,
};

function worseFailure(a: ToolFailure | undefined, b: ToolFailure | undefined): ToolFailure | undefined {
  if (!a) return b;
  if (!b) return a;
  return FAILURE_RANK[b] > FAILURE_RANK[a] ? b : a;
}

function failureFromRun(result: RunResult): ToolFailure | undefined {
  if (result.aborted) return "aborted";
  if (result.killed) return "timed-out";
  if (result.code === PERMISSION_DENIED_CODE) return "permission-denied";
  if (result.code === PERMISSION_APPROVAL_CODE) return "permission-approval-required";
  if (isMissingBinary(result)) return "missing-tool";
  return result.ok ? undefined : "execution";
}
```

Thread the runner through the four check functions (audit/outdated keep using `execFileRunner`):

- `phpLint(paths: string[], cwd: string, signal?: AbortSignal, runner: CommandRunner = execFileRunner)`
- `composerValidate(cwd: string, signal?: AbortSignal, runner: CommandRunner = execFileRunner)`
- `phpStaticAnalysis(rawCwd, signal?, selection = "auto", options: { runner?: CommandRunner; paths?: string[] } = {})`
- `phpTest(rawCwd, signal?, filter?, options: { runner?: CommandRunner; paths?: string[] } = {})`

Replace each `run(...)` in those functions with `(options.runner ?? execFileRunner).run(...)` (or the positional `runner`), and record failures:

```ts
// phpLint, inside the per-file loop
if (r.aborted || r.killed || isMissingBinary(r) || (!r.ok && r.code !== PHP_PARSE_ERROR_EXIT)) {
  failure = worseFailure(failure, failureFromRun(r) ?? "execution");
}
```

Return the failure on both successful-with-findings and error outcomes:

```ts
return { text, status: "ok", findings, ...(failure ? { failure } : {}) };
```

For permission-denied runs, include the reason in the text so the report can explain it:

```ts
if (r.code === PERMISSION_DENIED_CODE || r.code === PERMISSION_APPROVAL_CODE) {
  out.push(`${p}: ${r.stderr}`);
  failure = worseFailure(failure, failureFromRun(r));
  continue;
}
```

`composerValidate` maps `PERMISSION_*` before the generic branches and returns `failure: failureFromRun(r)`.

Both the `phpStaticAnalysis` no-analyzer branch and the `phpTest` no-runner branch must return `failure: "missing-tool"` so the adapters report `unavailable (not-installed)` instead of a generic execution failure:

```ts
return {
  text: "php_static_analysis: no analyzer found. ...",
  status: "error",
  findings: 0,
  failure: "missing-tool",
};
```

```ts
return {
  text: "php_test: no vendor/bin/pest or vendor/bin/phpunit found. ...",
  status: "error",
  findings: 0,
  failure: "missing-tool",
};
```

`phpStaticAnalysis` appends explicit paths:

```ts
const paths = options.paths && options.paths.length > 0 ? options.paths : [];
const phpstanArgs = ["analyse", "--no-progress", "--error-format=json", ...paths];
const psalmArgs = ["--no-cache", "--no-progress", "--output-format=json", ...paths];
```

`phpTest` delegates to a new exported function so `php_verify` gets structured counts without changing the registered tool input:

```ts
export interface TestRunOutcome extends ToolOutcome {
  kind: TestRunnerKind | null;
  summary: TestSummary | null;
}

export async function runTestSuite(
  rawCwd: string,
  signal?: AbortSignal,
  filter?: string,
  options: { runner?: CommandRunner; paths?: string[] } = {},
): Promise<TestRunOutcome> {
  // Resolve once: the vendor binaries are joined onto this path AND it is
  // the child cwd, so a relative input must not be applied twice.
  const cwd = resolve(rawCwd);
  const pestBin = join(cwd, "vendor/bin/pest");
  const phpunitBin = join(cwd, "vendor/bin/phpunit");
  const [hasPest, hasPhpunit] = await Promise.all([pathExists(pestBin), pathExists(phpunitBin)]);
  const kind: TestRunnerKind | null = hasPest ? "pest" : hasPhpunit ? "phpunit" : null;
  const binary = hasPest ? pestBin : hasPhpunit ? phpunitBin : null;
  if (!binary || !kind) {
    return {
      text: "php_test: no vendor/bin/pest or vendor/bin/phpunit found. Install the dev dependencies (composer require --dev pestphp/pest or phpunit/phpunit) and retry. Tests are never run from a bare PATH binary.",
      status: "error",
      findings: 0,
      failure: "missing-tool",
      kind: null,
      summary: null,
    };
  }
  const args = ["--log-junit", "php://stdout"];
  if (filter) args.push("--filter", filter);
  if (options.paths && options.paths.length > 0) args.push(...options.paths);
  const r = await (options.runner ?? execFileRunner).run(binary, args, cwd, 300000, signal);
  if (isMissingBinary(r)) {
    return {
      text: `php_test: could not execute the ${kind} binary.\n${r.stderr}`.trim(),
      status: "error",
      findings: 0,
      failure: "missing-tool",
      kind,
      summary: null,
    };
  }
  if (!r.ok && r.code === null) {
    return {
      text: `php_test: could not execute the ${kind} binary.\n${r.stderr}`.trim(),
      status: "error",
      findings: 0,
      failure: "execution",
      kind,
      summary: null,
    };
  }
  if (r.killed) {
    return {
      text: "php_test: the test run timed out or was aborted.",
      status: "error",
      findings: 0,
      failure: r.aborted ? "aborted" : "timed-out",
      kind,
      summary: null,
    };
  }
  const summary = parseJUnitReport(r.stdout);
  if (!summary) {
    // exit 2/config errors produce prose, not JUnit - that is an operational failure.
    if (!r.ok) {
      return {
        text: `php_test: the runner failed.\n${`${r.stdout}\n${r.stderr}`.trim().slice(0, 4000)}`,
        status: "error",
        findings: 0,
        failure: "execution",
        kind,
        summary: null,
      };
    }
    return {
      text: `${kind}: exited 0, but no parseable JUnit report was produced - cannot confirm tests actually ran (a filter may have matched nothing).\n${r.stdout.slice(0, 2000)}`.trim(),
      status: "ok",
      findings: 0,
      kind,
      summary: null,
    };
  }
  const skipped = summary.skipped > 0 ? `, ${summary.skipped} skipped` : "";
  const failing = summary.failing.length ? `\n${summary.failing.join("\n")}` : "";
  return {
    text: `${kind}: ${summary.tests} test(s), ${summary.assertions} assertions, ${summary.failures} failures, ${summary.errors} errors${skipped}${failing}`.slice(0, 16000),
    status: "ok",
    findings: summary.failures + summary.errors,
    kind,
    summary,
  };
}

export async function phpTest(
  rawCwd: string,
  signal?: AbortSignal,
  filter?: string,
): Promise<ToolOutcome> {
  const { text, status, findings, failure } = await runTestSuite(rawCwd, signal, filter);
  return { text, status, findings, ...(failure ? { failure } : {}) };
}
```

Keep the existing `php_test` text exactly; `phpTest`'s current tests must pass unchanged. If `filter` and `paths` are both set, pass `--filter <filter>` and then the paths (PHPUnit/Pest accept both).

Every early-return branch in the four functions carries the matching failure so adapters do not downgrade a timeout or abort into a generic execution error:

- `composerValidate`: `killed` → `failure: r.aborted ? "aborted" : "timed-out"`; generic failing exit → `failure: "execution"`; missing binary → `failure: "missing-tool"`.
- `phpStaticAnalysis`: no analyzer → `failure: "missing-tool"`; killed → aborted/timed-out; a failing exit without a parseable report → `failure: "execution"`.
- `runTestSuite`: no runner binary → `failure: "missing-tool"`; `isMissingBinary(r)` → `failure: "missing-tool"`; other `!r.ok && r.code === null` → `failure: "execution"`; killed → aborted/timed-out; a failing exit without JUnit → `failure: "execution"`.
- `phpLint`: missing binary → `missing-tool`; killed → aborted/timed-out; unreadable file → `execution`.

### Step 5: Implement the command permission interpreter

Create `test/verify-permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { commandRules, evaluateCommand } from "../src/verify/permissions.js";

const rule = (action: string, resource: string, effect: string) => ({ action, resource, effect });

describe("evaluateCommand", () => {
  it("reports tool-level-only when the host exposes no command rules", () => {
    expect(evaluateCommand([rule("skill", "php-*", "deny")], "php", ["-l", "a.php"], "/repo")).toEqual({
      decision: "tool-level-only",
    });
  });

  it("allows a matching allow rule", () => {
    const rules = [rule("bash", "php*", "allow")];
    expect(evaluateCommand(rules, "php", ["-l", "a.php"], "/repo").decision).toBe("allow");
  });

  it("denies a matching deny rule", () => {
    const rules = [rule("bash", "vendor/bin/phpunit*", "deny")];
    expect(
      evaluateCommand(rules, "/repo/vendor/bin/phpunit", ["--log-junit", "php://stdout"], "/repo").decision,
    ).toBe("deny");
  });

  it("requires approval for ask", () => {
    const rules = [rule("shell", "composer *", "ask")];
    expect(evaluateCommand(rules, "composer", ["validate"], "/repo").decision).toBe("approval-required");
  });

  it("uses the last matching rule", () => {
    const rules = [
      rule("bash", "php*", "allow"),
      rule("bash", "php -l *", "deny"),
    ];
    expect(evaluateCommand(rules, "php", ["-l", "a.php"], "/repo").decision).toBe("deny");
  });

  it("matches relative vendor binary candidates", () => {
    const rules = [rule("bash", "vendor/bin/phpstan*", "allow")];
    expect(
      evaluateCommand(rules, "/repo/vendor/bin/phpstan", ["analyse"], "/repo").decision,
    ).toBe("allow");
  });
});

describe("commandRules", () => {
  it("keeps only bash/shell rules", () => {
    const rules = [rule("bash", "*", "allow"), rule("skill", "*", "allow"), rule("shel?", "*", "ask")];
    expect(commandRules(rules)).toHaveLength(2);
  });
});
```

Create `src/verify/permissions.ts`:

```ts
import { basename, relative, isAbsolute } from "node:path";
import { globMatches } from "../util/glob.js";
import type { PermissionRule } from "../routing/permissions.js";
import type { CommandDecision } from "../tools/runner.js";

export type CommandPermission =
  | { decision: "allow" }
  | { decision: "deny" }
  | { decision: "approval-required" }
  | { decision: "tool-level-only" };

/** Only bash/shell rules govern spawned commands; skill/tool rules do not. */
export function commandRules(rules: readonly PermissionRule[]): PermissionRule[] {
  return rules.filter(
    (rule) => globMatches(rule.action, "bash") || globMatches(rule.action, "shell"),
  );
}

function commandCandidates(cmd: string, args: readonly string[], cwd: string): string[] {
  const line = [cmd, ...args].join(" ");
  const candidates = new Set<string>([line, cmd, basename(cmd)]);
  if (isAbsolute(cmd)) {
    const rel = relative(cwd, cmd);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
      candidates.add([rel, ...args].join(" "));
      candidates.add(rel);
    }
  }
  return [...candidates];
}

/**
 * Interprets command-level permission rules. The last matching rule wins,
 * matching OpenCode's rule ordering. A command with no matching rule is
 * allowed at tool level: the host already approved the `php_verify` call and
 * exposes no command-level decision for this spawn.
 */
export function evaluateCommand(
  rules: readonly PermissionRule[],
  cmd: string,
  args: readonly string[],
  cwd: string,
): CommandPermission {
  const candidates = commandCandidates(cmd, args, cwd);
  let match: PermissionRule | undefined;
  for (const rule of commandRules(rules)) {
    if (candidates.some((candidate) => globMatches(rule.resource, candidate))) match = rule;
  }
  if (!match) return { decision: "tool-level-only" };
  if (match.effect === "deny") return { decision: "deny" };
  if (match.effect === "ask") return { decision: "approval-required" };
  return { decision: "allow" };
}

export function toCommandDecision(permission: CommandPermission): CommandDecision {
  if (permission.decision === "deny") return { allowed: false, reason: "permission:denied" };
  if (permission.decision === "approval-required") {
    return { allowed: false, reason: "permission:approval-required" };
  }
  return { allowed: true };
}
```

### Step 6: Verify

```bash
npm run typecheck
npx vitest run test/verify-runner.test.ts test/verify-permissions.test.ts test/php-tools.test.ts test/permissions.test.ts
```

All existing `php-tools` tests must pass unchanged; the only intended behavioral addition is the optional `failure` field.

---

## Task 2: Verification types, deterministic aggregation and report rendering

**Goal:** Define the report contract once and make the aggregate status impossible to compute differently in different checks.

**Files:**

- Create: `src/verify/types.ts`, `src/verify/aggregate.ts`, `src/verify/report.ts`
- Test: `test/verify-aggregate.test.ts`, `test/verify-report.test.ts`

### Step 1: Write the aggregate tests first

Create `test/verify-aggregate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateStatus, countStatuses } from "../src/verify/aggregate.js";
import type { CheckResult, CheckStatus } from "../src/verify/types.js";

function result(status: CheckStatus, check: CheckResult["check"] = "lint"): CheckResult {
  return { check, status, reason: status === "passed" ? null : "test-reason", summary: "", findings: 0, detail: null };
}

describe("aggregateStatus", () => {
  it("passes only when every check passed", () => {
    expect(aggregateStatus([result("passed"), result("passed", "composer")])).toBe("passed");
  });

  it("fails when any check failed", () => {
    expect(aggregateStatus([result("passed"), result("failed", "static"), result("skipped")])).toBe("failed");
  });

  it("is unavailable when every check is unavailable", () => {
    expect(aggregateStatus([result("unavailable"), result("unavailable", "static")])).toBe("unavailable");
  });

  it("is partial for warnings, skips, timeouts, cancellations and mixes", () => {
    for (const status of ["warning", "skipped", "timed_out", "cancelled"] as const) {
      expect(aggregateStatus([result("passed"), result(status)])).toBe("partial");
      expect(aggregateStatus([result(status)])).toBe("partial");
    }
    expect(aggregateStatus([result("passed"), result("unavailable", "style")])).toBe("partial");
  });

  it("treats an empty report as unavailable, never passed", () => {
    expect(aggregateStatus([])).toBe("unavailable");
  });
});

describe("countStatuses", () => {
  it("counts each per-check status", () => {
    expect(
      countStatuses([
        result("passed"),
        result("passed", "composer"),
        result("failed", "static"),
        result("warning", "tests"),
        result("skipped", "style"),
        result("timed_out", "architecture"),
        result("cancelled", "lint"),
        result("unavailable", "composer"),
      ]),
    ).toEqual({
      passed: 2,
      failed: 1,
      warning: 1,
      skipped: 1,
      unavailable: 1,
      timed_out: 1,
      cancelled: 1,
    });
  });
});
```

### Step 2: Implement `src/verify/types.ts`

```ts
export const VERIFICATION_CHECKS = [
  "lint",
  "composer",
  "tests",
  "static",
  "style",
  "architecture",
] as const;

export type VerificationCheck = (typeof VERIFICATION_CHECKS)[number];

export const CHECK_STATUSES = [
  "passed",
  "failed",
  "warning",
  "skipped",
  "unavailable",
  "timed_out",
  "cancelled",
] as const;

export type CheckStatus = (typeof CHECK_STATUSES)[number];
export type AggregateStatus = "passed" | "failed" | "partial" | "unavailable" | "error";
export type VerificationScope = "changed" | "all";

/** Stable reason codes. They are categories, never raw command output. */
export const REASONS = {
  noChangedFiles: "no-changed-files",
  noRelevantChanges: "no-relevant-changes",
  notInstalled: "not-installed",
  notConfigured: "not-configured",
  changedScopeUnavailable: "changed-scope-unavailable",
  scannerUnavailable: "scanner-unavailable",
  fullSuiteFallback: "tests:full-suite-fallback",
  noTestReport: "no-test-report",
  permissionDenied: "permission:denied",
  approvalRequired: "permission:approval-required",
  aborted: "aborted",
  timeout: "timeout",
  executionFailed: "execution-failed",
} as const;

export interface CheckResult {
  check: VerificationCheck;
  status: CheckStatus;
  /** Stable reason code when status is not passed/failed; null otherwise. */
  reason: string | null;
  /** One-line result shown in the report. */
  summary: string;
  findings: number;
  /** Multi-line evidence for failures, already bounded by the adapter. */
  detail: string | null;
}

export interface VerificationReport {
  scope: VerificationScope;
  checks: CheckResult[];
  status: AggregateStatus;
  findings: number;
  /** Rendered report, capped at 24,000 characters. */
  text: string;
}

export function isVerificationCheck(value: unknown): value is VerificationCheck {
  return typeof value === "string" && (VERIFICATION_CHECKS as readonly string[]).includes(value);
}
```

### Step 3: Implement `src/verify/aggregate.ts`

```ts
import type { AggregateStatus, CheckResult, CheckStatus } from "./types.js";

export type StatusCounts = Record<CheckStatus, number>;

export function countStatuses(results: readonly CheckResult[]): StatusCounts {
  const counts: StatusCounts = {
    passed: 0,
    failed: 0,
    warning: 0,
    skipped: 0,
    unavailable: 0,
    timed_out: 0,
    cancelled: 0,
  };
  for (const result of results) counts[result.status] += 1;
  return counts;
}

export function findingsTotal(results: readonly CheckResult[]): number {
  return results.reduce((sum, result) => sum + result.findings, 0);
}

/**
 * Deterministic aggregate status, in the spec's order:
 * error > failed > passed > unavailable > partial.
 *
 * `error` is produced by the orchestrator when no report could be built; this
 * function cannot return it from check rows alone.
 */
export function aggregateStatus(results: readonly CheckResult[]): AggregateStatus {
  if (results.length === 0) return "unavailable";
  if (results.some((result) => result.status === "failed")) return "failed";
  if (results.every((result) => result.status === "passed")) return "passed";
  if (results.every((result) => result.status === "unavailable")) return "unavailable";
  return "partial";
}
```

### Step 4: Write the report tests first

Create `test/verify-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_VERIFICATION_CHARS, renderVerificationReport } from "../src/verify/report.js";
import type { CheckResult } from "../src/verify/types.js";

const passed = (check: CheckResult["check"], summary = "ok"): CheckResult => ({
  check,
  status: "passed",
  reason: null,
  summary,
  findings: 0,
  detail: null,
});

describe("renderVerificationReport", () => {
  it("renders checks in the fixed order and includes the summary", () => {
    const text = renderVerificationReport({
      scope: "changed",
      checks: [passed("static", "2 errors"), passed("lint", "3 files, 0 errors")],
      permissionNote: null,
      changedNote: null,
    }).text;
    expect(text.indexOf("lint")).toBeLessThan(text.indexOf("static"));
    expect(text).toContain("PHP verification (scope: changed)");
    expect(text).toContain("Summary: passed");
  });

  it("shows reason codes and a next step for partial reports", () => {
    const report = renderVerificationReport({
      scope: "changed",
      checks: [
        passed("composer", "valid"),
        {
          check: "style",
          status: "unavailable",
          reason: "not-installed",
          summary: "php-cs-fixer not installed",
          findings: 0,
          detail: null,
        },
      ],
      permissionNote: "permission:tool-level-only",
      changedNote: null,
    });
    expect(report.status).toBe("partial");
    expect(report.text).toContain("(not-installed)");
    expect(report.text).toContain("Permission: permission:tool-level-only");
    expect(report.text).toContain("Summary: partial");
    expect(report.text).toContain("Next:");
  });

  it("renders the failed aggregate and failure details", () => {
    const report = renderVerificationReport({
      scope: "all",
      checks: [
        {
          check: "static",
          status: "failed",
          reason: null,
          summary: "2 errors (PHPStan)",
          findings: 2,
          detail: "src/App.php:10 error one\nsrc/App.php:20 error two",
        },
      ],
      permissionNote: null,
      changedNote: null,
    });
    expect(report.status).toBe("failed");
    expect(report.findings).toBe(2);
    expect(report.text).toContain("Summary: failed");
    expect(report.text).toContain("src/App.php:10 error one");
    expect(report.text).toContain("fix the failing checks");
  });

  it("caps the report at 24,000 characters with a visible notice", () => {
    const report = renderVerificationReport({
      scope: "changed",
      checks: [
        {
          check: "tests",
          status: "failed",
          reason: null,
          summary: "many failures",
          findings: 1,
          detail: "x".repeat(40_000),
        },
      ],
      permissionNote: null,
      changedNote: null,
    });
    expect(report.text.length).toBeLessThanOrEqual(MAX_VERIFICATION_CHARS);
    expect(report.text).toContain("report truncated");
  });

  it("reports an unavailable aggregate without check rows", () => {
    const report = renderVerificationReport({
      scope: "changed",
      checks: [],
      permissionNote: null,
      changedNote: null,
    });
    expect(report.status).toBe("unavailable");
    expect(report.text).toContain("no checks were requested");
  });

  it("reports a tool-level error without pretending checks ran", () => {
    const report = renderVerificationReport({
      scope: "changed",
      checks: [],
      permissionNote: null,
      changedNote: null,
      error: "path escapes the verification root: ../x.php",
    });
    expect(report.status).toBe("error");
    expect(report.findings).toBe(0);
    expect(report.text).toContain("Verification error: path escapes the verification root: ../x.php");
  });
});
```

### Step 5: Implement `src/verify/report.ts`

```ts
import { aggregateStatus, countStatuses, findingsTotal } from "./aggregate.js";
import { VERIFICATION_CHECKS, type CheckResult, type CheckStatus, type VerificationScope } from "./types.js";

export const MAX_VERIFICATION_CHARS = 24_000;

const ICONS: Record<CheckStatus, string> = {
  passed: "✅",
  failed: "❌",
  warning: "⚠️",
  skipped: "⏭️",
  unavailable: "⏭️",
  timed_out: "⏱️",
  cancelled: "🚫",
};

const STATUS_ORDER: CheckStatus[] = [
  "passed",
  "failed",
  "warning",
  "skipped",
  "unavailable",
  "timed_out",
  "cancelled",
];

function ordered(results: readonly CheckResult[]): CheckResult[] {
  const rank = new Map(VERIFICATION_CHECKS.map((check, index) => [check, index]));
  return [...results].sort((a, b) => (rank.get(a.check) ?? 99) - (rank.get(b.check) ?? 99));
}

function summaryLine(results: readonly CheckResult[], status: string): string {
  const counts = countStatuses(results);
  const parts = STATUS_ORDER.filter((key) => counts[key] > 0).map((key) => `${counts[key]} ${key.replace("_", "-")}`);
  return parts.length ? `Summary: ${status} — ${parts.join(", ")}.` : `Summary: ${status}.`;
}

function nextLine(status: string): string {
  if (status === "failed") return "Next: fix the failing checks, then rerun php_verify.";
  if (status === "passed") return "Next: none.";
  if (status === "unavailable") return "Next: install or configure the project's tooling, or report which checks are unavailable.";
  if (status === "error") return "Next: correct the input or report the verification error.";
  return "Next: resolve the unavailable checks or report which checks could not run.";
}

function detailLines(result: CheckResult): string[] {
  if (!result.detail) return [];
  return result.detail
    .split("\n")
    .slice(0, 8)
    .map((line) => `    ${line}`);
}

export function renderVerificationReport(input: {
  scope: VerificationScope;
  checks: readonly CheckResult[];
  permissionNote: string | null;
  changedNote: string | null;
  /** Set only when the tool could not produce a report at all. */
  error?: string | null;
}): { text: string; status: ReturnType<typeof aggregateStatus>; findings: number } {
  if (input.error) {
    const text = [
      `PHP verification (scope: ${input.scope})`,
      "",
      `Verification error: ${input.error}`,
      nextLine("error"),
    ].join("\n");
    return { text: text.slice(0, MAX_VERIFICATION_CHARS), status: "error", findings: 0 };
  }
  const checks = ordered(input.checks);
  const status = aggregateStatus(checks);
  const findings = findingsTotal(checks);
  const lines = [`PHP verification (scope: ${input.scope})`];
  if (input.changedNote) lines.push(input.changedNote);
  if (input.permissionNote) lines.push(`Permission: ${input.permissionNote}`);
  if (checks.length === 0) {
    lines.push("", "Summary: unavailable — no checks were requested.", nextLine("unavailable"));
  } else {
    lines.push("");
    for (const result of checks) {
      const reason = result.reason ? ` (${result.reason})` : "";
      lines.push(`${ICONS[result.status]} ${result.check.padEnd(12)} ${result.summary}${reason}`);
      lines.push(...detailLines(result));
    }
    lines.push("", summaryLine(checks, status), nextLine(status));
  }
  let text = lines.join("\n");
  if (text.length > MAX_VERIFICATION_CHARS) {
    const notice = "\n[report truncated at 24,000 characters]";
    text = text.slice(0, MAX_VERIFICATION_CHARS - notice.length) + notice;
  }
  return { text, status, findings };
}
```

### Step 6: Verify

```bash
npm run typecheck
npx vitest run test/verify-aggregate.test.ts test/verify-report.test.ts
```

---

## Task 3: Normalize changed scope and validate paths

**Goal:** Turn host VCS status into deterministic root-relative file sets, and reject any path that escapes the verification root.

**Files:**

- Create: `src/verify/changed.ts`
- Test: `test/verify-changed.test.ts`

### Step 1: Write the tests first

Create `test/verify-changed.test.ts`:

```ts
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_SCOPE_FILES,
  isInside,
  listProjectPhpFiles,
  normalizeVcsStatus,
  pathsOverride,
  resolveVerificationRoot,
} from "../src/verify/changed.js";
import type { ProjectProfile } from "../src/profile.js";

const repo = "/repo";

function profileWith(layout: Partial<ProjectProfile["layout"]>): ProjectProfile {
  return {
    layout: { sourceRoots: ["src"], testRoots: ["tests"], ...layout },
  } as ProjectProfile;
}

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-scope-"));
  for (const [name, body] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

describe("resolveVerificationRoot", () => {
  it("defaults to the session root", () => {
    expect(resolveVerificationRoot(repo)).toEqual({ root: repo });
  });

  it("accepts a subdirectory and an absolute path inside the root", () => {
    expect(resolveVerificationRoot(repo, "packages/app")).toEqual({ root: "/repo/packages/app" });
    expect(resolveVerificationRoot(repo, "/repo/packages/app")).toEqual({ root: "/repo/packages/app" });
  });

  it("rejects paths outside the session root", () => {
    expect(resolveVerificationRoot(repo, "../elsewhere")).toEqual({
      error: "directory must stay inside the session root: ../elsewhere",
    });
    expect(resolveVerificationRoot(repo, "/etc")).toEqual({
      error: "directory must stay inside the session root: /etc",
    });
  });

  it("does not mistake a sibling prefix for a child", () => {
    expect(isInside("/repo/app", "/repo/application/src")).toBe(false);
    expect(isInside("/repo/app", "/repo/app/src")).toBe(true);
  });
});

describe("normalizeVcsStatus", () => {
  it("splits added/modified files from deleted files", () => {
    const scope = normalizeVcsStatus(repo, [
      { file: "src/A.php", status: "modified" },
      { file: "src/B.php", status: "deleted" },
      { file: "src/C.php", status: "added" },
    ]);
    expect(scope).toEqual({
      source: "vcs",
      files: ["src/A.php", "src/C.php"],
      deleted: ["src/B.php"],
      note: null,
    });
  });

  it("normalizes absolute and platform separators", () => {
    const scope = normalizeVcsStatus(repo, [
      { file: "/repo/src/A.php", status: "modified" },
      { file: "src\\\\B.php", status: "added" },
    ]);
    expect(scope.files).toEqual(["src/A.php", "src/B.php"]);
  });

  it("drops entries outside the root with a note", () => {
    const scope = normalizeVcsStatus(repo, [{ file: "/elsewhere/src/A.php", status: "modified" }]);
    expect(scope.files).toEqual([]);
    expect(scope.note).toContain("outside the verification root");
  });

  it("keeps an empty VCS list as a definite empty scope", () => {
    expect(normalizeVcsStatus(repo, [])).toEqual({
      source: "vcs",
      files: [],
      deleted: [],
      note: null,
    });
  });

  it("caps the file list and says so", () => {
    const data = Array.from({ length: MAX_SCOPE_FILES + 5 }, (_, i) => ({
      file: `src/F${i}.php`,
      status: "modified" as const,
    }));
    const scope = normalizeVcsStatus(repo, data);
    expect(scope.files).toHaveLength(MAX_SCOPE_FILES);
    expect(scope.note).toContain("truncated");
  });
});

describe("pathsOverride", () => {
  it("resolves relative and absolute PHP paths and deduplicates", () => {
    expect(pathsOverride(repo, ["src/A.php", "/repo/src/A.php", "src/B.php"])).toEqual({
      files: ["src/A.php", "src/B.php"],
      ignored: 0,
    });
  });

  it("ignores non-PHP paths instead of passing them to checkers", () => {
    expect(pathsOverride(repo, ["src/A.php", "README.md"])).toEqual({
      files: ["src/A.php"],
      ignored: 1,
    });
  });

  it("rejects an escaping path", () => {
    expect(pathsOverride(repo, ["../escape.php"])).toEqual({
      error: "path escapes the verification root: ../escape.php",
    });
  });
});

describe("listProjectPhpFiles", () => {
  it("lists source and test PHP files, skipping vendor, node_modules, hidden dirs and symlinks", async () => {
    const root = tree({
      "src/A.php": "<?php",
      "tests/ATest.php": "<?php",
      "vendor/lib/V.php": "<?php",
      "node_modules/x/X.php": "<?php",
      ".hidden/H.php": "<?php",
      "README.md": "docs",
    });
    symlinkSync(join(root, "src"), join(root, "tests", "linked"));
    const result = await listProjectPhpFiles(root, profileWith({}));
    expect(result.files).toEqual(["src/A.php", "tests/ATest.php"]);
    expect(result.truncated).toBe(false);
  });

  it("falls back to conventional roots when the profile has none", async () => {
    const root = tree({ "src/A.php": "<?php", "test/BTest.php": "<?php" });
    const result = await listProjectPhpFiles(root, profileWith({ sourceRoots: [], testRoots: [] }));
    expect(result.files).toEqual(["src/A.php", "test/BTest.php"]);
  });

  it("caps the list", async () => {
    const root = tree(
      Object.fromEntries(Array.from({ length: MAX_SCOPE_FILES + 2 }, (_, i) => [`src/F${i}.php`, "<?php"])),
    );
    const result = await listProjectPhpFiles(root, profileWith({}));
    expect(result.files).toHaveLength(MAX_SCOPE_FILES);
    expect(result.truncated).toBe(true);
  });
});
```

### Step 2: Implement `src/verify/changed.ts`

```ts
import { readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ProjectProfile } from "../profile.js";

/** Upper bound for a single verification file set (output and runtime). */
export const MAX_SCOPE_FILES = 500;

export interface VcsFileStatusLike {
  file: string;
  status: "added" | "deleted" | "modified";
}

export interface ChangedScope {
  source: "vcs" | "paths" | "unavailable";
  /** Root-relative POSIX paths to check (added + modified, or the path override). */
  files: string[];
  /** Root-relative POSIX paths that were deleted; never passed to a checker. */
  deleted: string[];
  note: string | null;
}

export interface PhpFileList {
  files: string[];
  truncated: boolean;
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function isInside(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveVerificationRoot(
  sessionRoot: string,
  requested?: string,
): { root: string } | { error: string } {
  const root = resolve(sessionRoot, requested && requested.length > 0 ? requested : ".");
  if (!isInside(sessionRoot, root)) {
    return { error: `directory must stay inside the session root: ${requested ?? "."}` };
  }
  return { root };
}

function rootRelative(root: string, file: string): string | null {
  const normalized = file.split("\\").join("/");
  const abs = isAbsolute(normalized) ? normalized : resolve(root, normalized);
  if (!isInside(root, abs)) return null;
  const rel = toPosix(relative(root, abs));
  return rel === "" ? null : rel;
}

export function normalizeVcsStatus(
  root: string,
  data: readonly VcsFileStatusLike[],
): ChangedScope {
  const files = new Set<string>();
  const deleted = new Set<string>();
  let outside = 0;
  for (const entry of data) {
    const rel = rootRelative(root, entry.file);
    if (!rel) {
      outside += 1;
      continue;
    }
    if (entry.status === "deleted") deleted.add(rel);
    else files.add(rel);
  }
  const all = [...files];
  const capped = all.slice(0, MAX_SCOPE_FILES);
  const notes: string[] = [];
  if (outside > 0) notes.push(`${outside} changed file(s) outside the verification root were ignored`);
  if (all.length > capped.length) notes.push(`file list truncated to ${MAX_SCOPE_FILES}`);
  return {
    source: "vcs",
    files: capped,
    deleted: [...deleted].slice(0, MAX_SCOPE_FILES),
    note: notes.length ? notes.join("; ") : null,
  };
}

export function pathsOverride(
  root: string,
  paths: readonly string[],
): { files: string[]; ignored: number } | { error: string } {
  const files = new Set<string>();
  let ignored = 0;
  for (const raw of paths) {
    const abs = resolve(root, raw);
    if (!isInside(root, abs)) return { error: `path escapes the verification root: ${raw}` };
    const rel = toPosix(relative(root, abs));
    if (!rel.endsWith(".php")) {
      ignored += 1;
      continue;
    }
    files.add(rel);
  }
  return { files: [...files].slice(0, MAX_SCOPE_FILES), ignored };
}

const SKIPPED_DIRS = new Set(["vendor", "node_modules"]);

async function walkPhpFiles(
  root: string,
  dirs: readonly string[],
  cap: number,
): Promise<PhpFileList> {
  const files: string[] = [];
  let truncated = false;
  for (const dir of dirs) {
    if (files.length >= cap) {
      truncated = true;
      break;
    }
    const stack = [dir];
    while (stack.length > 0 && files.length < cap) {
      const current = stack.pop()!;
      let entries;
      try {
        entries = await readdir(join(root, current), { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isSymbolicLink()) continue;
        const rel = `${current}/${entry.name}`;
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRS.has(entry.name)) stack.push(rel);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".php")) continue;
        if (files.length >= cap) {
          truncated = true;
          break;
        }
        files.push(rel);
      }
    }
    if (stack.length > 0) truncated = true;
  }
  files.sort((a, b) => a.localeCompare(b));
  return { files: files.slice(0, cap), truncated };
}

async function existingDir(root: string, name: string): Promise<boolean> {
  try {
    return (await stat(join(root, name))).isDirectory();
  } catch {
    return false;
  }
}

export async function listProjectPhpFiles(
  root: string,
  profile: ProjectProfile,
  cap: number = MAX_SCOPE_FILES,
): Promise<PhpFileList> {
  const configured = [...profile.layout.sourceRoots, ...profile.layout.testRoots];
  let dirs = [...new Set(configured.map((dir) => toPosix(dir).replace(/\/$/, "")))].filter(Boolean);
  if (dirs.length === 0) {
    const conventional = ["src", "tests", "test", "spec"];
    const present = await Promise.all(conventional.map(async (name) => ((await existingDir(root, name)) ? name : null)));
    dirs = present.filter((name): name is string => name !== null);
  }
  return walkPhpFiles(root, dirs, cap);
}
```

### Step 3: Verify

```bash
npm run typecheck
npx vitest run test/verify-changed.test.ts
```

The symlink test is intentionally part of the suite: verification must never follow a link out of the project and lint the same files twice.

---

## Task 4: Map changed production files to tests

**Goal:** Select the smallest trustworthy test set, and fall back to the full suite whenever the mapping is incomplete or a source file was deleted.

**Files:**

- Create: `src/verify/test-selection.ts`
- Test: `test/verify-test-selection.test.ts`

### Step 1: Write the tests first

Create `test/verify-test-selection.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import type { ChangedScope } from "../src/verify/changed.js";
import { MAX_TARGETED_TESTS, selectTests } from "../src/verify/test-selection.js";

function profile(): ProjectProfile {
  return {
    layout: { sourceRoots: ["src"], testRoots: ["tests"] },
  } as ProjectProfile;
}

function tree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-tests-"));
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "<?php");
  }
  return root;
}

function changed(files: string[], deleted: string[] = []): ChangedScope {
  return { source: "vcs", files, deleted, note: null };
}

describe("selectTests", () => {
  it("maps a production file to the path-preserving test file", async () => {
    const root = tree(["src/Payment/PaymentProcessor.php", "tests/Payment/PaymentProcessorTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/Payment/PaymentProcessor.php"]),
    });
    expect(result).toMatchObject({
      mode: "targeted",
      paths: ["tests/Payment/PaymentProcessorTest.php"],
      direct: 0,
      mapped: 1,
      fallbackReason: null,
    });
  });

  it("finds tests under the Unit/Feature/Integration conventions", async () => {
    const root = tree(["src/Billing/Invoice.php", "tests/Unit/Billing/InvoiceTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/Billing/Invoice.php"]),
    });
    expect(result.paths).toEqual(["tests/Unit/Billing/InvoiceTest.php"]);
    expect(result.mode).toBe("targeted");
  });

  it("finds a test by class name anywhere under the test roots", async () => {
    const root = tree(["src/Billing/Invoice.php", "tests/Feature/Deep/InvoiceTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/Billing/Invoice.php"]),
    });
    expect(result.paths).toEqual(["tests/Feature/Deep/InvoiceTest.php"]);
  });

  it("always includes directly changed test files", async () => {
    const root = tree(["tests/Unit/ExistingTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["tests/Unit/ExistingTest.php"]),
    });
    expect(result).toMatchObject({ mode: "targeted", paths: ["tests/Unit/ExistingTest.php"], direct: 1 });
  });

  it("falls back to the full suite when a changed source has no test", async () => {
    const root = tree(["src/Billing/Invoice.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/Billing/Invoice.php"]),
    });
    expect(result).toMatchObject({
      mode: "full-suite",
      paths: [],
      fallbackReason: "tests:full-suite-fallback",
    });
  });

  it("falls back to the full suite when a source file was deleted", async () => {
    const root = tree(["tests/Unit/Billing/InvoiceTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed([], ["src/Billing/Invoice.php"]),
    });
    expect(result.mode).toBe("full-suite");
    expect(result.fallbackReason).toBe("tests:full-suite-fallback");
  });

  it("does not run tests when only non-PHP files changed", async () => {
    const root = tree(["src/Billing/Invoice.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["README.md"]),
    });
    expect(result).toMatchObject({ mode: "none", paths: [], fallbackReason: null });
  });

  it("uses conventional source/test roots when the profile has none", async () => {
    const root = tree(["src/A.php", "test/ATest.php"]);
    const result = await selectTests({
      root,
      profile: { layout: { sourceRoots: [], testRoots: [] } } as ProjectProfile,
      changed: changed(["src/A.php"]),
    });
    expect(result.paths).toEqual(["test/ATest.php"]);
  });

  it("never returns a production source path", async () => {
    const root = tree(["src/A.php", "tests/A/ATest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/A.php"]),
    });
    for (const path of result.paths) expect(path.startsWith("tests/")).toBe(true);
  });

  it("falls back when a changed PHP file has no detectable source root", async () => {
    const root = tree(["lib/A.php", "tests/BTest.php"]);
    const result = await selectTests({
      root,
      profile: { layout: { sourceRoots: [], testRoots: ["tests"] } } as ProjectProfile,
      changed: changed(["lib/A.php"]),
    });
    expect(result.mode).toBe("full-suite");
    expect(result.fallbackReason).toBe("tests:full-suite-fallback");
  });

  it("falls back when the candidate set is unreasonably large", async () => {
    const files = Array.from({ length: MAX_TARGETED_TESTS + 1 }, (_, i) => `tests/Unit/T${i}/T${i}Test.php`);
    const root = tree(["src/A.php", ...files]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/A.php"]),
    });
    expect(result.mode).toBe("full-suite");
  });
});
```

### Step 2: Implement `src/verify/test-selection.ts`

```ts
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ProjectProfile } from "../profile.js";
import { MAX_SCOPE_FILES, toPosix, type ChangedScope } from "./changed.js";
import { REASONS } from "./types.js";

/** Bounded scan for `*Test.php` files under the test roots. */
export const MAX_TEST_SEARCH_ENTRIES = 2_000;
/** Above this, a targeted run costs more than it saves; use the full suite. */
export const MAX_TARGETED_TESTS = 200;
const CONVENTION_DIRS = ["Unit", "Feature", "Integration"];
const SKIPPED_DIRS = new Set(["vendor", "node_modules"]);

export interface TestSelection {
  mode: "targeted" | "full-suite" | "none";
  /** Root-relative test paths; always empty for full-suite and none. */
  paths: string[];
  direct: number;
  mapped: number;
  fallbackReason: string | null;
}

function underAny(file: string, roots: readonly string[]): boolean {
  return roots.some((root) => file === root || file.startsWith(`${root}/`));
}

function relativeTo(file: string, roots: readonly string[]): string | null {
  for (const root of roots) {
    if (file.startsWith(`${root}/`)) return file.slice(root.length + 1);
  }
  return null;
}

async function existingDir(root: string, name: string): Promise<boolean> {
  try {
    return (await stat(join(root, name))).isDirectory();
  } catch {
    return false;
  }
}

async function findRoots(
  root: string,
  configured: readonly string[],
  conventional: readonly string[],
): Promise<string[]> {
  const roots = [...new Set(configured.map((dir) => toPosix(dir).replace(/\/$/, "")).filter(Boolean))];
  if (roots.length > 0) return roots;
  const present = await Promise.all(
    conventional.map(async (name) => ((await existingDir(root, name)) ? name : null)),
  );
  return present.filter((name): name is string => name !== null);
}

async function isFile(root: string, rel: string): Promise<boolean> {
  try {
    return (await stat(join(root, rel))).isFile();
  } catch {
    return false;
  }
}

interface TestIndex {
  byName: Map<string, string[]>;
  truncated: boolean;
}

/** Indexes `*Test.php` basenames under the test roots with a bounded walk. */
async function indexTestFiles(root: string, testRoots: readonly string[]): Promise<TestIndex> {
  const byName = new Map<string, string[]>();
  let seen = 0;
  let truncated = false;
  for (const testRoot of testRoots) {
    const stack = [testRoot];
    while (stack.length > 0) {
      const current = stack.pop()!;
      let entries;
      try {
        entries = await readdir(join(root, current), { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
        seen += 1;
        if (seen > MAX_TEST_SEARCH_ENTRIES) {
          return { byName, truncated: true };
        }
        const rel = `${current}/${entry.name}`;
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRS.has(entry.name)) stack.push(rel);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith("Test.php")) continue;
        const list = byName.get(entry.name) ?? [];
        list.push(rel);
        byName.set(entry.name, list);
      }
    }
  }
  for (const list of byName.values()) list.sort((a, b) => a.localeCompare(b));
  return { byName, truncated: false };
}

export async function selectTests(input: {
  root: string;
  profile: ProjectProfile;
  changed: ChangedScope;
}): Promise<TestSelection> {
  const testRoots = await findRoots(input.root, input.profile.layout.testRoots, ["tests", "test", "spec"]);
  const sourceRoots = await findRoots(input.root, input.profile.layout.sourceRoots, ["src"]);
  const phpChanged = input.changed.files.filter((file) => file.endsWith(".php"));
  const direct = phpChanged.filter((file) => underAny(file, testRoots));
  const sourceChanged = phpChanged.filter(
    (file) => !underAny(file, testRoots) && underAny(file, sourceRoots),
  );
  const deletedSources = input.changed.deleted.filter(
    (file) => file.endsWith(".php") && !underAny(file, testRoots) && underAny(file, sourceRoots),
  );
  const directOnly = (): TestSelection => ({
    mode: direct.length > 0 ? "targeted" : "none",
    paths: direct,
    direct: direct.length,
    mapped: 0,
    fallbackReason: null,
  });
  const fallback = (mapped: number): TestSelection => ({
    mode: "full-suite",
    paths: [],
    direct: direct.length,
    mapped,
    fallbackReason: REASONS.fullSuiteFallback,
  });

  if (deletedSources.length > 0) return fallback(0);
  // A non-test PHP change outside the known source roots cannot be mapped or
  // ruled out; run the full suite rather than silently skipping tests.
  const unclassified = phpChanged.filter(
    (file) => !underAny(file, testRoots) && !underAny(file, sourceRoots),
  );
  if (unclassified.length > 0) return fallback(0);
  if (sourceChanged.length === 0) return directOnly();

  const mapped = new Set<string>();
  const missing: string[] = [];
  for (const source of sourceChanged) {
    const rel = relativeTo(source, sourceRoots);
    if (!rel) {
      missing.push(source);
      continue;
    }
    const testName = rel.replace(/\.php$/, "Test.php");
    const candidates = [
      ...testRoots.map((testRoot) => `${testRoot}/${testName}`),
      ...CONVENTION_DIRS.flatMap((dir) =>
        testRoots.map((testRoot) => `${testRoot}/${dir}/${testName}`),
      ),
    ];
    let found = false;
    for (const candidate of candidates) {
      if (await isFile(input.root, candidate)) {
        mapped.add(candidate);
        found = true;
      }
    }
    if (!found) missing.push(source);
  }

  if (missing.length > 0) {
    const index = await indexTestFiles(input.root, testRoots);
    if (index.truncated) return fallback(mapped.size);
    for (const source of missing) {
      const name = `${basename(source).replace(/\.php$/, "")}Test.php`;
      const candidates = index.byName.get(name) ?? [];
      if (candidates.length === 0) return fallback(mapped.size);
      for (const candidate of candidates) mapped.add(candidate);
    }
  }

  for (const file of direct) mapped.add(file);
  if (mapped.size > MAX_TARGETED_TESTS || mapped.size > MAX_SCOPE_FILES) {
    return fallback(mapped.size);
  }
  const paths = [...mapped].sort((a, b) => a.localeCompare(b));
  return {
    mode: "targeted",
    paths,
    direct: direct.length,
    mapped: paths.length - direct.length,
    fallbackReason: null,
  };
}
```

### Step 3: Verify

```bash
npm run typecheck
npx vitest run test/verify-test-selection.test.ts
```

The returned `paths` must always be under a test root. If a future change breaks that, the orchestrator test in Task 7 (`never passes production paths`) must fail too.

---

## Task 5: Lint, composer and static adapters

**Goal:** Map the existing check functions onto normalized `CheckResult`s, with one shared failure mapping.

**Files:**

- Create: `src/verify/checks/shared.ts`, `src/verify/checks/lint.ts`, `src/verify/checks/composer.ts`, `src/verify/checks/static.ts`
- Test: `test/verify-checks.test.ts`

### Step 1: Implement the shared result helpers

Create `src/verify/checks/shared.ts`:

```ts
import type { ProjectProfile } from "../../profile.js";
import type { ToolOutcome } from "../../tools/php-tools.js";
import type { CommandRunner } from "../../tools/runner.js";
import type { ChangedScope } from "../changed.js";
import {
  REASONS,
  type CheckResult,
  type CheckStatus,
  type VerificationCheck,
  type VerificationScope,
} from "../types.js";

export interface CheckEnvironment {
  root: string;
  profile: ProjectProfile;
  scope: VerificationScope;
  changed: ChangedScope;
  /** Root-relative PHP files selected for lint/static/style. */
  files: string[];
  runner: CommandRunner;
  signal: AbortSignal;
}

function result(
  check: VerificationCheck,
  status: CheckStatus,
  reason: string | null,
  summary: string,
  findings = 0,
  detail: string | null = null,
): CheckResult {
  return { check, status, reason, summary, findings, detail };
}

export const passed = (check: VerificationCheck, summary: string): CheckResult =>
  result(check, "passed", null, summary);

export const failed = (
  check: VerificationCheck,
  summary: string,
  findings: number,
  detail: string | null = null,
): CheckResult => result(check, "failed", null, summary, findings, detail);

export const warning = (
  check: VerificationCheck,
  reason: string,
  summary: string,
  findings = 0,
  detail: string | null = null,
): CheckResult => result(check, "warning", reason, summary, findings, detail);

export const skipped = (check: VerificationCheck, reason: string, summary: string): CheckResult =>
  result(check, "skipped", reason, summary);

export const unavailable = (
  check: VerificationCheck,
  reason: string,
  summary: string,
  detail: string | null = null,
): CheckResult => result(check, "unavailable", reason, summary, 0, detail);

export const cancelled = (
  check: VerificationCheck,
  reason: string,
  summary: string,
  detail: string | null = null,
): CheckResult => result(check, "cancelled", reason, summary, 0, detail);

export const timedOut = (check: VerificationCheck, summary: string): CheckResult =>
  result(check, "timed_out", REASONS.timeout, summary);

function firstLine(text: string): string {
  const line = text.split("\n").find((candidate) => candidate.trim().length > 0) ?? "check could not run";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

/**
 * Maps a tool failure or operational error to a failed check, or returns null
 * when the tool completed and the adapter should interpret its findings.
 */
export function failureResult(check: VerificationCheck, outcome: ToolOutcome): CheckResult | null {
  switch (outcome.failure) {
    case "aborted":
      return cancelled(check, REASONS.aborted, "interrupted by AbortSignal");
    case "timed-out":
      return timedOut(check, "exceeded the check timeout");
    case "permission-denied":
      return cancelled(check, REASONS.permissionDenied, "command denied by session permissions");
    case "permission-approval-required":
      return cancelled(check, REASONS.approvalRequired, "command requires approval");
    case "missing-tool":
      return unavailable(check, REASONS.notInstalled, firstLine(outcome.text), outcome.text);
    case "execution":
      return unavailable(check, REASONS.executionFailed, firstLine(outcome.text), outcome.text);
    default:
      break;
  }
  if (outcome.status === "error") {
    return unavailable(check, REASONS.executionFailed, firstLine(outcome.text), outcome.text);
  }
  return null;
}
```

The permission note is computed by the orchestrator, not the adapters.

### Step 2: Implement the lint adapter

Create `src/verify/checks/lint.ts`:

```ts
import { phpLint } from "../../tools/php-tools.js";
import { REASONS } from "../types.js";
import { failed, failureResult, passed, skipped, type CheckEnvironment } from "./shared.js";
import type { CheckResult } from "../types.js";

/** Matches php_lint's own output cap so the summary is honest. */
export const LINT_FILE_CAP = 20;

export async function lintCheck(env: CheckEnvironment): Promise<CheckResult> {
  if (env.files.length === 0) return skipped("lint", REASONS.noRelevantChanges, "no PHP files to lint");
  const files = env.files.slice(0, LINT_FILE_CAP);
  const note =
    env.files.length > files.length ? ` (first ${files.length} of ${env.files.length})` : "";
  const outcome = await phpLint(files, env.root, env.signal, env.runner);
  const failure = failureResult("lint", outcome);
  if (failure) return failure;
  if (outcome.findings === 0) return passed("lint", `${files.length} file(s), 0 errors${note}`);
  return failed("lint", `${outcome.findings} parse error(s)${note}`, outcome.findings, outcome.text);
}
```

### Step 3: Implement the composer adapter

Create `src/verify/checks/composer.ts`:

```ts
import { composerValidate } from "../../tools/php-tools.js";
import { REASONS, type CheckResult } from "../types.js";
import { failed, failureResult, passed, unavailable, type CheckEnvironment } from "./shared.js";

export async function composerCheck(env: CheckEnvironment): Promise<CheckResult> {
  if (!env.profile.hasComposerJson) {
    return unavailable("composer", REASONS.notConfigured, "composer.json not found");
  }
  const outcome = await composerValidate(env.root, env.signal, env.runner);
  const failure = failureResult("composer", outcome);
  if (failure) return failure;
  if (outcome.findings === 0) return passed("composer", "valid");
  return failed("composer", "invalid composer.json", outcome.findings, outcome.text);
}
```

### Step 4: Implement the static adapter

Create `src/verify/checks/static.ts`:

```ts
import { phpStaticAnalysis, type StaticAnalysisSelection } from "../../tools/php-tools.js";
import { REASONS, type CheckResult } from "../types.js";
import { failed, failureResult, passed, skipped, unavailable, type CheckEnvironment } from "./shared.js";

export const MAX_STATIC_FILES = 200;

function analyzer(env: CheckEnvironment): StaticAnalysisSelection | null {
  // Spec §10.1: detect from the analyzer config or the dev dependency, not
  // only from `composer.json` require-dev. `Boolean` keeps partial test
  // profiles without `configFiles` safe.
  if (env.profile.tools.phpstan || Boolean(env.profile.configFiles?.phpstan)) return "phpstan";
  if (env.profile.tools.psalm || Boolean(env.profile.configFiles?.psalm)) return "psalm";
  return null;
}

export async function staticCheck(env: CheckEnvironment): Promise<CheckResult> {
  const selection = analyzer(env);
  if (!selection) {
    return unavailable("static", REASONS.notInstalled, "PHPStan/Psalm not installed");
  }
  if (env.files.length === 0) {
    return skipped("static", REASONS.noRelevantChanges, "no PHP files to analyse");
  }
  const targeted = env.scope === "changed";
  const files = env.files.slice(0, MAX_STATIC_FILES);
  const note = env.files.length > files.length ? `, first ${files.length} of ${env.files.length}` : "";
  const outcome = await phpStaticAnalysis(env.root, env.signal, selection, {
    runner: env.runner,
    paths: targeted ? files : undefined,
  });
  const failure = failureResult("static", outcome);
  if (failure) return failure;
  const label = selection === "phpstan" ? "PHPStan" : "Psalm";
  const mode = targeted ? `${files.length} file(s)${note}` : "full analysis";
  if (outcome.findings === 0) return passed("static", `0 errors (${label}, ${mode})`);
  return failed(
    "static",
    `${outcome.findings} error(s) (${label}, ${mode})`,
    outcome.findings,
    outcome.text,
  );
}
```

### Step 5: Write the adapter tests

Create `test/verify-checks.test.ts`:

```ts
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import type { ChangedScope } from "../src/verify/changed.js";
import { composerCheck } from "../src/verify/checks/composer.js";
import { LINT_FILE_CAP, lintCheck } from "../src/verify/checks/lint.js";
import { staticCheck } from "../src/verify/checks/static.js";
import type { CheckEnvironment } from "../src/verify/checks/shared.js";
import {
  PERMISSION_DENIED_CODE,
  type CommandRunner,
  type RunResult,
} from "../src/tools/runner.js";

function tempProject(binary: string): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-static-"));
  const full = join(root, binary);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, "#!/bin/sh\n");
  chmodSync(full, 0o755);
  return root;
}

type Script = (cmd: string, args: readonly string[], cwd: string) => Partial<RunResult>;

function runner(script: Script): CommandRunner {
  return {
    run: async (cmd, args, cwd) => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      killed: false,
      aborted: false,
      ...script(cmd, args, cwd),
    }),
  };
}

const changed: ChangedScope = { source: "vcs", files: ["src/A.php"], deleted: [], note: null };

function env(overrides: Partial<CheckEnvironment> = {}): CheckEnvironment {
  const profile = {
    hasComposerJson: true,
    tools: { phpstan: true, psalm: false },
  } as ProjectProfile;
  return {
    root: "/repo",
    profile,
    scope: "changed",
    changed,
    files: ["src/A.php"],
    runner: runner(() => ({})),
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("lintCheck", () => {
  it("passes a clean file", async () => {
    const result = await lintCheck(env({ runner: runner(() => ({ stdout: "No syntax errors detected" })) }));
    expect(result).toMatchObject({ status: "passed", reason: null, findings: 0 });
    expect(result.summary).toContain("1 file(s), 0 errors");
  });

  it("fails a parse error", async () => {
    const result = await lintCheck(
      env({ runner: runner(() => ({ ok: false, code: 255, stdout: "PHP Parse error" })) }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 1 });
  });

  it("reports a missing PHP binary as unavailable", async () => {
    const result = await lintCheck(env({ runner: runner(() => ({ ok: false, code: "ENOENT" })) }));
    expect(result).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("reports an abort as cancelled", async () => {
    const result = await lintCheck(
      env({ runner: runner(() => ({ ok: false, killed: true, aborted: true })) }),
    );
    expect(result).toMatchObject({ status: "cancelled", reason: "aborted" });
  });

  it("reports a timeout as timed_out", async () => {
    const result = await lintCheck(
      env({ runner: runner(() => ({ ok: false, killed: true, aborted: false })) }),
    );
    expect(result).toMatchObject({ status: "timed_out", reason: "timeout" });
  });

  it("reports a denied command as cancelled and never bypasses it", async () => {
    const result = await lintCheck(
      env({ runner: runner(() => ({ ok: false, code: PERMISSION_DENIED_CODE })) }),
    );
    expect(result).toMatchObject({ status: "cancelled", reason: "permission:denied" });
  });

  it("skips when no PHP files changed", async () => {
    const result = await lintCheck(env({ files: [] }));
    expect(result).toMatchObject({ status: "skipped", reason: "no-relevant-changes" });
  });

  it("caps the files and says so", async () => {
    let calls = 0;
    const files = Array.from({ length: LINT_FILE_CAP + 2 }, (_, i) => `src/F${i}.php`);
    const result = await lintCheck(
      env({
        files,
        runner: runner(() => {
          calls += 1;
          return {};
        }),
      }),
    );
    expect(calls).toBe(LINT_FILE_CAP);
    expect(result.summary).toContain(`first ${LINT_FILE_CAP} of ${files.length}`);
  });
});

describe("composerCheck", () => {
  it("passes a valid manifest", async () => {
    const result = await composerCheck(env({ runner: runner(() => ({ stdout: "valid" })) }));
    expect(result).toMatchObject({ status: "passed", summary: "valid" });
  });

  it("fails an invalid manifest", async () => {
    const result = await composerCheck(env({ runner: runner(() => ({ ok: false, code: 1 })) }));
    expect(result).toMatchObject({ status: "failed", findings: 1 });
  });

  it("is unavailable without composer.json", async () => {
    const result = await composerCheck(
      env({ profile: { hasComposerJson: false, tools: {} } as ProjectProfile }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "not-configured" });
  });
});

describe("staticCheck", () => {
  it("passes a clean analysis", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const result = await staticCheck(env({ root }));
    expect(result).toMatchObject({ status: "passed", findings: 0 });
    expect(result.summary).toContain("PHPStan");
  });

  it("fails with analyzer findings", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const result = await staticCheck(
      env({
        root,
        runner: runner(() => ({
          ok: false,
          code: 1,
          stdout: `{"totals":{"errors":1,"file_errors":1},"files":{"${join(root, "src/A.php")}":{"messages":[{"message":"bad"}]}}}`,
        })),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 2 });
  });

  it("is unavailable when no analyzer is installed", async () => {
    const result = await staticCheck(
      env({ profile: { hasComposerJson: true, tools: { phpstan: false, psalm: false } } as ProjectProfile }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("detects an analyzer from its config file", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const result = await staticCheck(
      env({
        root,
        profile: {
          hasComposerJson: true,
          tools: { phpstan: false, psalm: false },
          configFiles: { phpstan: "phpstan.neon", psalm: null },
        } as ProjectProfile,
      }),
    );
    expect(result.status).toBe("passed");
    expect(result.summary).toContain("PHPStan");
  });

  it("passes explicit file paths only in changed scope", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const seen: string[][] = [];
    const result = await staticCheck(
      env({
        root,
        runner: runner((cmd, args) => {
          seen.push([...args]);
          return {};
        }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(seen[0]).toContain("src/A.php");
  });

  it("does not pass file paths in scope all", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const seen: string[][] = [];
    await staticCheck(
      env({
        root,
        scope: "all",
        runner: runner((cmd, args) => {
          seen.push([...args]);
          return {};
        }),
      }),
    );
    expect(seen[0]).not.toContain("src/A.php");
  });
});
```

### Step 6: Verify

```bash
npm run typecheck
npx vitest run test/verify-checks.test.ts
```

---

## Task 6: Tests, style and architecture adapters

**Goal:** Complete the six checks without ever running a production path through the test runner, applying a fix, or bypassing a permission rule.

**Files:**

- Create: `src/verify/checks/tests.ts`, `src/verify/checks/style.ts`, `src/verify/checks/architecture.ts`
- Modify: `src/verify/types.ts` (add `tests:skipped`), `src/verify/checks/shared.ts` (add `runFailure` and `pathExists`)
- Test: `test/verify-checks-tools.test.ts`

### Step 1: Extend the shared helpers

Add to `src/verify/types.ts`:

```ts
  testsSkipped: "tests:skipped",
```

Add to `src/verify/checks/shared.ts`:

```ts
import { access } from "node:fs/promises";
import {
  PERMISSION_APPROVAL_CODE,
  PERMISSION_DENIED_CODE,
  isMissingBinary,
  type RunResult,
} from "../../tools/runner.js";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Maps raw runner failures (style/architecture spawn directly). */
export function runFailure(
  check: VerificationCheck,
  result: RunResult,
  missingSummary: string,
): CheckResult | null {
  if (result.aborted) return cancelled(check, REASONS.aborted, "interrupted by AbortSignal");
  if (result.killed) return timedOut(check, "exceeded the check timeout");
  if (result.code === PERMISSION_DENIED_CODE) {
    return cancelled(check, REASONS.permissionDenied, "command denied by session permissions");
  }
  if (result.code === PERMISSION_APPROVAL_CODE) {
    return cancelled(check, REASONS.approvalRequired, "command requires approval");
  }
  if (isMissingBinary(result)) return unavailable(check, REASONS.notInstalled, missingSummary);
  return null;
}
```

### Step 2: Implement the tests adapter

Create `src/verify/checks/tests.ts`:

```ts
import type { ProjectProfile } from "../../profile.js";
import { runTestSuite, type TestRunOutcome } from "../../tools/php-tools.js";
import { selectTests } from "../test-selection.js";
import { REASONS, type CheckResult } from "../types.js";
import {
  failed,
  failureResult,
  passed,
  skipped,
  unavailable,
  warning,
  type CheckEnvironment,
} from "./shared.js";

export function testsDetected(profile: ProjectProfile): boolean {
  return Boolean(
    profile.tools.phpunit ||
      profile.tools.pest ||
      profile.configFiles?.phpunit ||
      profile.configFiles?.pest,
  );
}

function mapTests(
  outcome: TestRunOutcome,
  mode: string,
  reason: string | null,
): CheckResult {
  const failure = failureResult("tests", outcome);
  if (failure) return failure;
  let result: CheckResult;
  if (!outcome.summary) {
    result = warning(
      "tests",
      REASONS.noTestReport,
      `runner exited 0 without a JUnit report (${mode})`,
      0,
      outcome.text,
    );
  } else if (outcome.summary.failures + outcome.summary.errors > 0) {
    const failing = outcome.summary.failures + outcome.summary.errors;
    result = failed("tests", `${failing} failing (${mode})`, failing, outcome.text);
  } else if (outcome.summary.skipped > 0) {
    result = warning(
      "tests",
      REASONS.testsSkipped,
      `${outcome.summary.tests} passed, ${outcome.summary.skipped} skipped (${mode})`,
      0,
      outcome.text,
    );
  } else {
    result = passed(
      "tests",
      `${outcome.summary.tests} test(s), ${outcome.summary.assertions} assertion(s) (${mode})`,
    );
  }
  return reason ? { ...result, reason } : result;
}

export async function testsCheck(env: CheckEnvironment): Promise<CheckResult> {
  if (!testsDetected(env.profile)) {
    return unavailable("tests", REASONS.notInstalled, "PHPUnit/Pest not installed");
  }
  if (env.scope === "changed") {
    if (env.changed.files.length === 0 && env.changed.deleted.length === 0) {
      return skipped("tests", REASONS.noChangedFiles, "no changed files");
    }
    const selection = await selectTests({
      root: env.root,
      profile: env.profile,
      changed: env.changed,
    });
    if (selection.mode === "none") {
      return skipped("tests", REASONS.noRelevantChanges, "no PHP source or test changes");
    }
    if (selection.mode === "full-suite") {
      const outcome = await runTestSuite(env.root, env.signal, undefined, { runner: env.runner });
      return mapTests(outcome, "full suite (fallback)", REASONS.fullSuiteFallback);
    }
    const outcome = await runTestSuite(env.root, env.signal, undefined, {
      runner: env.runner,
      paths: selection.paths,
    });
    const direct = selection.direct > 0 ? `${selection.direct} changed test(s)` : "";
    const mapped = selection.mapped > 0 ? `${selection.mapped} mapped test(s)` : "";
    const detail = [direct, mapped].filter(Boolean).join(" + ");
    return mapTests(outcome, `targeted: ${detail || `${selection.paths.length} test file(s)`}`, null);
  }
  const outcome = await runTestSuite(env.root, env.signal, undefined, { runner: env.runner });
  return mapTests(outcome, "full suite", null);
}
```

### Step 3: Implement the style adapter

Create `src/verify/checks/style.ts`:

```ts
import { join } from "node:path";
import type { ProjectProfile } from "../../profile.js";
import { REASONS, type CheckResult } from "../types.js";
import {
  failed,
  passed,
  pathExists,
  runFailure,
  skipped,
  unavailable,
  type CheckEnvironment,
} from "./shared.js";

export const MAX_STYLE_FILES = 200;
export type StyleTool = "cs-fixer" | "phpcs";

export function styleTool(profile: ProjectProfile): StyleTool | null {
  if (profile.tools.csFixer || Boolean(profile.configFiles?.csFixer)) return "cs-fixer";
  if (profile.tools.phpcs || Boolean(profile.configFiles?.phpcs)) return "phpcs";
  return null;
}

function countPhpcsFindings(text: string): number {
  const match = text.match(/A TOTAL OF (\d+) ERRORS? AND (\d+) WARNINGS?/i);
  if (!match) return 1;
  const total = Number(match[1]) + Number(match[2]);
  return total > 0 ? total : 1;
}

export async function styleCheck(env: CheckEnvironment): Promise<CheckResult> {
  if (env.files.length === 0) {
    return skipped("style", REASONS.noRelevantChanges, "no PHP files to check");
  }
  const tool = styleTool(env.profile);
  if (!tool) return unavailable("style", REASONS.notInstalled, "php-cs-fixer/PHPCS not installed");
  const files = env.files.slice(0, MAX_STYLE_FILES);
  const note = env.files.length > files.length ? ` (first ${files.length} of ${env.files.length})` : "";

  if (tool === "cs-fixer") {
    const binary = join(env.root, "vendor/bin/php-cs-fixer");
    if (!(await pathExists(binary))) {
      return unavailable("style", REASONS.notInstalled, "php-cs-fixer not installed");
    }
    const result = await env.runner.run(
      binary,
      ["fix", "--dry-run", "--diff", "--using-cache=no", "--path-mode=intersection", ...files],
      env.root,
      120_000,
      env.signal,
    );
    const failure = runFailure("style", result, "php-cs-fixer not installed");
    if (failure) return failure;
    if (result.ok) return passed("style", `${files.length} file(s) clean${note}`);
    if (result.code === 8) {
      const text = `${result.stdout}\n${result.stderr}`.trim();
      const match = text.match(/Found (\d+) of (\d+) files that can be fixed/);
      const count = match ? Number(match[1]) : files.length;
      return failed("style", `${count} file(s) need formatting${note}`, count, text);
    }
    return unavailable("style", REASONS.executionFailed, "php-cs-fixer could not run", `${result.stdout}\n${result.stderr}`.trim());
  }

  const binary = join(env.root, "vendor/bin/phpcs");
  if (!(await pathExists(binary))) {
    return unavailable("style", REASONS.notInstalled, "PHPCS not installed");
  }
  const result = await env.runner.run(
    binary,
    ["--report=summary", "--no-colors", ...files],
    env.root,
    120_000,
    env.signal,
  );
  const failure = runFailure("style", result, "PHPCS not installed");
  if (failure) return failure;
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (result.ok) return passed("style", `${files.length} file(s) clean${note}`);
  if (result.code === 1) {
    const count = countPhpcsFindings(text);
    return failed("style", `${count} coding-standard finding(s)${note}`, count, text);
  }
  return unavailable("style", REASONS.executionFailed, "PHPCS could not run", text);
}
```

### Step 4: Implement the architecture adapter

Create `src/verify/checks/architecture.ts`:

```ts
import { join } from "node:path";
import type { ProjectProfile } from "../../profile.js";
import { REASONS, type CheckResult } from "../types.js";
import {
  failed,
  passed,
  pathExists,
  runFailure,
  skipped,
  unavailable,
  type CheckEnvironment,
} from "./shared.js";

export function architectureDetected(profile: ProjectProfile): boolean {
  return Boolean(
    profile.tools.deptrac ||
      profile.configFiles?.deptrac ||
      profile.configFiles?.architecture,
  );
}

function countViolations(text: string): number {
  const matches = text.match(/(\d+)\s+violation/gi) ?? [];
  const counts = matches
    .map((match) => Number(match.match(/\d+/)?.[0] ?? "0"))
    .filter((count) => count > 0);
  return counts.length ? Math.max(...counts) : 1;
}

export async function architectureCheck(env: CheckEnvironment): Promise<CheckResult> {
  const deptracConfigured =
    env.profile.tools.deptrac || Boolean(env.profile.configFiles?.deptrac);
  if (!deptracConfigured) {
    return skipped(
      "architecture",
      REASONS.scannerUnavailable,
      env.profile.configFiles?.architecture
        ? "configured boundaries; Phase 5 scanner adapter pending"
        : "no Deptrac config; Phase 5 scanner adapter pending",
    );
  }
  const binary = join(env.root, "vendor/bin/deptrac");
  if (!(await pathExists(binary))) {
    return unavailable("architecture", REASONS.notInstalled, "Deptrac not installed");
  }
  const result = await env.runner.run(
    binary,
    ["analyse", "--no-progress"],
    env.root,
    120_000,
    env.signal,
  );
  const failure = runFailure("architecture", result, "Deptrac not installed");
  if (failure) return failure;
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (result.ok) return passed("architecture", "no violations (Deptrac)");
  if (result.code === 1) {
    const count = countViolations(text);
    return failed("architecture", `${count} violation(s) (Deptrac)`, count, text);
  }
  return unavailable("architecture", REASONS.executionFailed, "Deptrac could not run", text);
}
```

### Step 5: Write the adapter tests

Create `test/verify-checks-tools.test.ts`:

```ts
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import { architectureCheck } from "../src/verify/checks/architecture.js";
import { testsCheck } from "../src/verify/checks/tests.js";
import { styleCheck } from "../src/verify/checks/style.js";
import type { CheckEnvironment } from "../src/verify/checks/shared.js";
import type { ChangedScope } from "../src/verify/changed.js";
import type { CommandRunner, RunResult } from "../src/tools/runner.js";

type Script = (cmd: string, args: readonly string[]) => Partial<RunResult>;

function runner(script: Script): CommandRunner {
  return {
    run: async (cmd, args) => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      killed: false,
      aborted: false,
      ...script(cmd, args),
    }),
  };
}

function binary(root: string, rel: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, "#!/bin/sh\n", { mode: 0o755 });
  chmodSync(full, 0o755);
}

function project(files: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-check-tools-"));
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "<?php");
  }
  return root;
}

const JUNIT_CLEAN =
  '<testsuites><testsuite tests="2" assertions="3" failures="0" errors="0" skipped="0"></testsuite></testsuites>';
const JUNIT_FAILING =
  '<testsuites><testsuite tests="2" assertions="3" failures="1" errors="0" skipped="0"></testsuite></testsuites>';
const JUNIT_SKIPPED =
  '<testsuites><testsuite tests="2" assertions="3" failures="0" errors="0" skipped="1"></testsuite></testsuites>';

const changed: ChangedScope = { source: "vcs", files: ["src/A.php"], deleted: [], note: null };

function env(root: string, overrides: Partial<CheckEnvironment> = {}): CheckEnvironment {
  const profile = {
    hasComposerJson: true,
    tools: {
      phpunit: true,
      pest: false,
      phpstan: false,
      psalm: false,
      csFixer: false,
      phpcs: false,
      deptrac: false,
    },
    configFiles: {
      phpunit: "phpunit.xml",
      pest: null,
      phpstan: null,
      psalm: null,
      phpcs: null,
      csFixer: null,
      deptrac: null,
      architecture: null,
    },
  } as unknown as ProjectProfile;
  return {
    root,
    profile,
    scope: "changed",
    changed,
    files: ["src/A.php"],
    runner: runner(() => ({})),
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("testsCheck", () => {
  it("maps changed production files to tests and passes", async () => {
    const root = project(["src/A.php", "tests/ATest.php"]);
    binary(root, "vendor/bin/phpunit");
    let args: readonly string[] = [];
    const result = await testsCheck(
      env(root, {
        runner: runner((_cmd, next) => {
          args = next;
          return { stdout: JUNIT_CLEAN };
        }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(result.summary).toContain("targeted");
    expect(args).toContain("tests/ATest.php");
    expect(args).not.toContain("src/A.php");
  });

  it("falls back to the full suite when no test maps", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/phpunit");
    let args: readonly string[] = [];
    const result = await testsCheck(
      env(root, {
        runner: runner((_cmd, next) => {
          args = next;
          return { stdout: JUNIT_CLEAN };
        }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(result.reason).toBe("tests:full-suite-fallback");
    expect(args).not.toContain("src/A.php");
  });

  it("fails failing tests", async () => {
    const root = project(["src/A.php", "tests/ATest.php"]);
    binary(root, "vendor/bin/phpunit");
    const result = await testsCheck(
      env(root, { runner: runner(() => ({ stdout: JUNIT_FAILING })) }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 1 });
  });

  it("warns when tests were skipped", async () => {
    const root = project(["src/A.php", "tests/ATest.php"]);
    binary(root, "vendor/bin/phpunit");
    const result = await testsCheck(
      env(root, { runner: runner(() => ({ stdout: JUNIT_SKIPPED })) }),
    );
    expect(result).toMatchObject({ status: "warning", reason: "tests:skipped" });
  });

  it("warns when the runner exits 0 without JUnit", async () => {
    const root = project(["src/A.php", "tests/ATest.php"]);
    binary(root, "vendor/bin/phpunit");
    const result = await testsCheck(env(root));
    expect(result).toMatchObject({ status: "warning", reason: "no-test-report" });
  });

  it("skips when the changed list is empty", async () => {
    const root = project(["src/A.php"]);
    const result = await testsCheck(
      env(root, { changed: { source: "vcs", files: [], deleted: [], note: null } }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "no-changed-files" });
  });

  it("skips non-PHP changes", async () => {
    const root = project(["src/A.php"]);
    const result = await testsCheck(
      env(root, { changed: { source: "vcs", files: ["README.md"], deleted: [], note: null } }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "no-relevant-changes" });
  });
});

describe("styleCheck", () => {
  it("passes a clean CS-Fixer dry run", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/php-cs-fixer");
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, csFixer: true } },
      }),
    );
    expect(result.status).toBe("passed");
  });

  it("fails when CS-Fixer would change files", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/php-cs-fixer");
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, csFixer: true } },
        runner: runner(() => ({
          ok: false,
          code: 8,
          stdout: "Found 2 of 3 files that can be fixed",
        })),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 2 });
  });

  it("reports a missing configured binary as unavailable", async () => {
    const root = project(["src/A.php"]);
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, csFixer: true } },
      }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("uses PHPCS when CS-Fixer is absent", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/phpcs");
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, phpcs: true } },
        runner: runner(() => ({ ok: false, code: 1, stdout: "A TOTAL OF 2 ERRORS AND 1 WARNINGS WERE FOUND IN 1 FILES" })),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 3 });
  });
});

describe("architectureCheck", () => {
  it("is skipped scanner-unavailable without Deptrac", async () => {
    const root = project(["src/A.php"]);
    const result = await architectureCheck(env(root));
    expect(result).toMatchObject({ status: "skipped", reason: "scanner-unavailable" });
  });

  it("reports configured boundaries as scanner-unavailable", async () => {
    const root = project(["src/A.php"]);
    const base = env(root);
    const result = await architectureCheck(
      env(root, {
        profile: {
          ...base.profile,
          configFiles: { ...base.profile.configFiles, architecture: "php-toolkit.json" },
        },
      }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "scanner-unavailable" });
    expect(result.summary).toContain("configured boundaries");
  });

  it("is unavailable when Deptrac is configured but not installed", async () => {
    const root = project(["src/A.php"]);
    const base = env(root);
    const result = await architectureCheck(
      env(root, {
        profile: { ...base.profile, tools: { ...base.profile.tools, deptrac: true } },
      }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("passes a clean Deptrac run", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/deptrac");
    const base = env(root);
    const result = await architectureCheck(
      env(root, {
        profile: { ...base.profile, tools: { ...base.profile.tools, deptrac: true } },
      }),
    );
    expect(result.status).toBe("passed");
  });

  it("fails Deptrac violations", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/deptrac");
    const base = env(root);
    const result = await architectureCheck(
      env(root, {
        profile: { ...base.profile, tools: { ...base.profile.tools, deptrac: true } },
        runner: runner(() => ({ ok: false, code: 1, stdout: "3 violations found" })),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 3 });
  });
});
```

### Step 6: Verify

```bash
npm run typecheck
npx vitest run test/verify-checks-tools.test.ts
```

---

## Task 7: The `phpVerify` orchestrator

**Goal:** Resolve input once, decide the check set once, run checks in a fixed order, and turn every failure into a report row instead of a thrown tool error.

**Files:**

- Create: `src/verify/verify.ts`
- Test: `test/verify.test.ts`

### Step 1: Write the orchestrator tests first

Create `test/verify.test.ts`:

```ts
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import type { CommandRunner, RunResult } from "../src/tools/runner.js";
import { phpVerify, type VerifyDependencies } from "../src/verify/verify.js";

type Script = (cmd: string, args: readonly string[]) => Partial<RunResult>;

function runner(script: Script): CommandRunner {
  return {
    run: async (cmd, args) => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      killed: false,
      aborted: false,
      ...script(cmd, args),
    }),
  };
}

function project(files: string[], binaries: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-verify-"));
  for (const file of [...files, ...binaries]) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.startsWith("vendor/bin/") ? "#!/bin/sh\n" : "<?php", {
      mode: file.startsWith("vendor/bin/") ? 0o755 : undefined,
    });
    if (file.startsWith("vendor/bin/")) chmodSync(full, 0o755);
  }
  return root;
}

function profile(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    hasComposerJson: true,
    tools: {
      phpunit: true,
      pest: false,
      phpstan: true,
      psalm: false,
      csFixer: true,
      phpcs: false,
      deptrac: false,
    },
    configFiles: {
      phpunit: "phpunit.xml",
      pest: null,
      phpstan: "phpstan.neon",
      psalm: null,
      phpcs: null,
      csFixer: null,
      deptrac: null,
      architecture: null,
    },
    layout: { sourceRoots: ["src"], testRoots: ["tests"] },
    ...overrides,
  } as unknown as ProjectProfile;
}

const JUNIT_CLEAN =
  '<testsuites><testsuite tests="2" assertions="3" failures="0" errors="0" skipped="0"></testsuite></testsuites>';

function defaultScript(cmd: string): Partial<RunResult> {
  if (cmd === "php") return { stdout: "No syntax errors detected" };
  if (cmd === "composer") return { stdout: "valid" };
  if (cmd.endsWith("phpunit")) return { stdout: JUNIT_CLEAN };
  return {};
}

function deps(root: string, overrides: Partial<VerifyDependencies> = {}): VerifyDependencies {
  return {
    sessionRoot: root,
    profileFor: async () => profile(),
    vcsStatus: async () => ({ data: [{ file: "src/A.php", status: "modified" }] }),
    permissionRules: [],
    signal: new AbortController().signal,
    runner: runner(defaultScript),
    ...overrides,
  };
}

describe("phpVerify", () => {
  it("runs all detected checks in the fixed order for scope all", async () => {
    const root = project(
      ["src/A.php", "tests/ATest.php", "composer.json"],
      ["vendor/bin/phpunit", "vendor/bin/phpstan", "vendor/bin/php-cs-fixer"],
    );
    const report = await phpVerify(
      { scope: "all" },
      deps(root, {
        profileFor: async () =>
          profile({
            tools: { ...profile().tools, deptrac: true },
            configFiles: { ...profile().configFiles, deptrac: "deptrac.yaml" },
          }),
        runner: runner((cmd) => (cmd.endsWith("deptrac") ? {} : defaultScript(cmd))),
      }),
    );
    expect(report.status).toBe("passed");
    expect(report.checks.map((check) => check.check)).toEqual([
      "lint",
      "composer",
      "tests",
      "static",
      "style",
      "architecture",
    ]);
  });

  it("skips changed-file checks when the VCS reports no changes", async () => {
    const root = project(["src/A.php", "composer.json"], ["vendor/bin/phpunit", "vendor/bin/phpstan"]);
    const report = await phpVerify(
      { scope: "changed" },
      deps(root, { vcsStatus: async () => ({ data: [] }) }),
    );
    expect(report.status).toBe("partial");
    expect(report.checks.find((check) => check.check === "composer")?.status).toBe("passed");
    for (const check of report.checks.filter((row) => row.check !== "composer")) {
      expect(check).toMatchObject({ status: "skipped", reason: "no-changed-files" });
    }
  });

  it("never passes when the changed scope cannot be determined", async () => {
    const root = project(["src/A.php", "composer.json"], ["vendor/bin/phpunit", "vendor/bin/phpstan"]);
    const report = await phpVerify(
      { scope: "changed" },
      deps(root, {
        vcsStatus: async () => {
          throw new Error("no repository");
        },
      }),
    );
    expect(report.status).toBe("partial");
    expect(report.checks.find((check) => check.check === "composer")?.status).toBe("passed");
    expect(report.checks.find((check) => check.check === "lint")).toMatchObject({
      status: "unavailable",
      reason: "changed-scope-unavailable",
    });
    expect(report.text).toContain('scope: "all"');
  });

  it("uses provided paths for lint while tests still use VCS mapping", async () => {
    const root = project(["src/A.php", "src/B.php", "tests/ATest.php"], ["vendor/bin/phpunit"]);
    const linted: string[] = [];
    const tested: string[] = [];
    const report = await phpVerify(
      { scope: "changed", checks: ["lint", "tests"], paths: ["src/B.php"] },
      deps(root, {
        runner: runner((cmd, args) => {
          if (cmd === "php") linted.push(...args);
          if (cmd.endsWith("phpunit")) tested.push(...args);
          return defaultScript(cmd);
        }),
      }),
    );
    expect(report.status).toBe("passed");
    expect(linted).toContain("src/B.php");
    expect(linted).not.toContain("src/A.php");
    expect(tested).toContain("tests/ATest.php");
    expect(tested.some((arg) => arg.startsWith("src/"))).toBe(false);
  });

  it("uses provided paths for lint in scope all while tests run the full suite", async () => {
    const root = project(["src/A.php", "src/B.php", "tests/ATest.php"], ["vendor/bin/phpunit"]);
    const linted: string[] = [];
    const tested: string[] = [];
    const report = await phpVerify(
      { scope: "all", checks: ["lint", "tests"], paths: ["src/B.php"] },
      deps(root, {
        vcsStatus: async () => ({ data: [{ file: "src/A.php", status: "modified" }] }),
        runner: runner((cmd, args) => {
          if (cmd === "php") linted.push(...args);
          if (cmd.endsWith("phpunit")) tested.push(...args);
          return defaultScript(cmd);
        }),
      }),
    );
    expect(report.status).toBe("passed");
    expect(linted).toContain("src/B.php");
    expect(linted).not.toContain("src/A.php");
    expect(tested).not.toContain("tests/ATest.php");
  });

  it("rejects paths outside the verification root", async () => {
    const root = project(["src/A.php"]);
    const report = await phpVerify({ scope: "changed", paths: ["../escape.php"] }, deps(root));
    expect(report.status).toBe("error");
    expect(report.text).toContain("path escapes the verification root");
  });

  it("reports denied commands as cancelled and never spawns them", async () => {
    const root = project(["src/A.php", "composer.json"], ["vendor/bin/phpunit", "vendor/bin/phpstan"]);
    const spy = vi.fn(async () => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      killed: false,
      aborted: false,
    }));
    const report = await phpVerify(
      { scope: "all", checks: ["lint", "composer"] },
      deps(root, {
        runner: { run: spy },
        permissionRules: [{ action: "bash", resource: "php*", effect: "deny" }],
      }),
    );
    expect(spy.mock.calls.some(([cmd]) => cmd === "php")).toBe(false);
    expect(report.checks.find((check) => check.check === "lint")).toMatchObject({
      status: "cancelled",
      reason: "permission:denied",
    });
    expect(report.checks.find((check) => check.check === "composer")?.status).toBe("passed");
    expect(report.status).toBe("partial");
  });

  it("marks explicitly requested missing tooling as unavailable", async () => {
    const root = project(["src/A.php", "composer.json"]);
    const report = await phpVerify(
      { scope: "all", checks: ["style", "composer"] },
      deps(root, {
        profileFor: async () =>
          profile({
            tools: { ...profile().tools, csFixer: false },
            configFiles: { ...profile().configFiles, csFixer: null },
          }),
      }),
    );
    expect(report.status).toBe("partial");
    expect(report.checks.find((check) => check.check === "style")).toMatchObject({
      status: "unavailable",
      reason: "not-installed",
    });
  });

  it("cancels every check when the signal is already aborted", async () => {
    const root = project(["src/A.php", "composer.json"]);
    const controller = new AbortController();
    controller.abort();
    const report = await phpVerify(
      { scope: "all", checks: ["lint", "composer"] },
      deps(root, { signal: controller.signal }),
    );
    expect(report.status).toBe("partial");
    for (const check of report.checks) {
      expect(check).toMatchObject({ status: "cancelled", reason: "aborted" });
    }
  });

  it("rejects an invalid checks list", async () => {
    const root = project(["src/A.php"]);
    const report = await phpVerify(
      { checks: ["lint", "nope"] as never },
      deps(root),
    );
    expect(report.status).toBe("error");
    expect(report.text).toContain("checks must be");
  });
});
```

### Step 2: Implement `src/verify/verify.ts`

```ts
import type { ProjectProfile } from "../profile.js";
import type { PermissionRule } from "../routing/permissions.js";
import { authorizedRunner, execFileRunner, type CommandRunner } from "../tools/runner.js";
import { findingsTotal } from "./aggregate.js";
import { architectureCheck, architectureDetected } from "./checks/architecture.js";
import { composerCheck } from "./checks/composer.js";
import { lintCheck } from "./checks/lint.js";
import type { CheckEnvironment } from "./checks/shared.js";
import { staticCheck } from "./checks/static.js";
import { styleCheck, styleTool } from "./checks/style.js";
import { testsCheck, testsDetected } from "./checks/tests.js";
import {
  listProjectPhpFiles,
  normalizeVcsStatus,
  pathsOverride,
  resolveVerificationRoot,
  type ChangedScope,
  type VcsFileStatusLike,
} from "./changed.js";
import { commandRules, evaluateCommand, toCommandDecision } from "./permissions.js";
import { renderVerificationReport } from "./report.js";
import {
  REASONS,
  VERIFICATION_CHECKS,
  isVerificationCheck,
  type CheckResult,
  type VerificationCheck,
  type VerificationReport,
  type VerificationScope,
} from "./types.js";

export interface VerifyInput {
  directory?: string;
  scope?: VerificationScope;
  checks?: readonly VerificationCheck[];
  paths?: readonly string[];
}

export interface VerifyDependencies {
  /** Session root resolved from context.sessionID. */
  sessionRoot: string;
  profileFor: (root: string) => Promise<ProjectProfile>;
  vcsStatus: (directory: string) => Promise<{ data: readonly VcsFileStatusLike[] }>;
  permissionRules?: readonly PermissionRule[];
  signal: AbortSignal;
  /** Defaults to execFileRunner; tests inject a scripted runner. */
  runner?: CommandRunner;
}

const ADAPTERS: Record<
  VerificationCheck,
  (env: CheckEnvironment) => Promise<CheckResult>
> = {
  lint: lintCheck,
  composer: composerCheck,
  tests: testsCheck,
  static: staticCheck,
  style: styleCheck,
  architecture: architectureCheck,
};

const CHANGED_FILE_CHECKS = new Set<VerificationCheck>(["lint", "tests", "static", "style"]);

/** Detected checks in the fixed report order. `lint` is always available. */
export function detectedChecks(profile: ProjectProfile): VerificationCheck[] {
  const checks: VerificationCheck[] = ["lint"];
  if (profile.hasComposerJson) checks.push("composer");
  if (testsDetected(profile)) checks.push("tests");
  if (
    profile.tools.phpstan ||
    profile.tools.psalm ||
    Boolean(profile.configFiles?.phpstan) ||
    Boolean(profile.configFiles?.psalm)
  ) {
    checks.push("static");
  }
  if (styleTool(profile)) checks.push("style");
  if (architectureDetected(profile)) checks.push("architecture");
  return checks;
}

function errorReport(scope: VerificationScope, message: string): VerificationReport {
  const rendered = renderVerificationReport({
    scope,
    checks: [],
    permissionNote: null,
    changedNote: null,
    error: message,
  });
  return { scope, checks: [], status: rendered.status, findings: 0, text: rendered.text };
}

async function readChangedScope(
  deps: VerifyDependencies,
  root: string,
): Promise<ChangedScope> {
  try {
    const status = await deps.vcsStatus(root);
    return normalizeVcsStatus(root, status.data ?? []);
  } catch {
    return { source: "unavailable", files: [], deleted: [], note: null };
  }
}

export async function phpVerify(
  input: VerifyInput,
  deps: VerifyDependencies,
): Promise<VerificationReport> {
  const scope = input.scope ?? "changed";
  if (scope !== "changed" && scope !== "all") {
    return errorReport("changed", `invalid scope: ${String(input.scope)}`);
  }
  if (input.checks !== undefined) {
    if (
      !Array.isArray(input.checks) ||
      input.checks.length === 0 ||
      !input.checks.every(isVerificationCheck)
    ) {
      return errorReport(
        scope,
        "checks must be a non-empty array of lint, composer, tests, static, style, architecture",
      );
    }
  }
  if (input.paths !== undefined && (!Array.isArray(input.paths) || input.paths.some((p) => typeof p !== "string"))) {
    return errorReport(scope, "paths must be an array of strings");
  }

  const rootResult = resolveVerificationRoot(deps.sessionRoot, input.directory);
  if ("error" in rootResult) return errorReport(scope, rootResult.error);
  const root = rootResult.root;
  const profile = await deps.profileFor(root);

  const provided =
    input.paths && input.paths.length > 0 ? pathsOverride(root, input.paths) : null;
  if (provided && "error" in provided) return errorReport(scope, provided.error);

  const notes: string[] = [];
  let changed: ChangedScope;
  let files: string[];
  if (provided) {
    // Spec §10.1: explicit paths override the changed-file set for lint,
    // static and style regardless of scope. Tests still use VCS mapping for
    // changed scope and the full suite for scope all.
    changed =
      scope === "changed"
        ? await readChangedScope(deps, root)
        : { source: "vcs", files: [], deleted: [], note: null };
    files = provided.files;
    if (provided.ignored > 0) notes.push(`${provided.ignored} non-PHP path(s) ignored`);
    if (scope === "changed") {
      if (changed.source === "unavailable") {
        notes.push('changed scope unavailable for test mapping; use scope: "all"');
      } else if (changed.note) {
        notes.push(changed.note);
      }
    }
  } else if (scope === "all") {
    changed = { source: "vcs", files: [], deleted: [], note: null };
    const list = await listProjectPhpFiles(root, profile);
    files = list.files;
    if (list.truncated) notes.push(`scope truncated to ${files.length} PHP files`);
  } else {
    changed = await readChangedScope(deps, root);
    files = changed.files.filter((file) => file.endsWith(".php"));
    if (changed.source === "unavailable") {
      notes.push('changed scope unavailable from the host VCS; use scope: "all"');
    } else if (changed.note) {
      notes.push(changed.note);
    }
  }

  const rules = deps.permissionRules ?? [];
  const permissionNote = commandRules(rules).length === 0 ? "permission:tool-level-only" : null;
  const gated = authorizedRunner(deps.runner ?? execFileRunner, (cmd, args, cwd) =>
    toCommandDecision(evaluateCommand(rules, cmd, args, cwd)),
  );
  const requested = input.checks ?? detectedChecks(profile);
  const ordered = VERIFICATION_CHECKS.filter((check) => requested.includes(check));
  const changedUnavailable = scope === "changed" && !provided && changed.source === "unavailable";
  const emptyChanged =
    scope === "changed" &&
    !provided &&
    changed.source === "vcs" &&
    changed.files.length === 0 &&
    changed.deleted.length === 0;

  const results: CheckResult[] = [];
  for (const check of ordered) {
    if (deps.signal.aborted) {
      results.push({
        check,
        status: "cancelled",
        reason: REASONS.aborted,
        summary: "interrupted by AbortSignal",
        findings: 0,
        detail: null,
      });
      continue;
    }
    if ((changedUnavailable && CHANGED_FILE_CHECKS.has(check)) || (provided && changed.source === "unavailable" && check === "tests")) {
      results.push({
        check,
        status: "unavailable",
        reason: REASONS.changedScopeUnavailable,
        summary: "changed scope could not be determined",
        findings: 0,
        detail: null,
      });
      continue;
    }
    if (emptyChanged && CHANGED_FILE_CHECKS.has(check)) {
      results.push({
        check,
        status: "skipped",
        reason: REASONS.noChangedFiles,
        summary: "VCS reports no changed files",
        findings: 0,
        detail: null,
      });
      continue;
    }
    try {
      results.push(
        await ADAPTERS[check]({
          root,
          profile,
          scope,
          changed,
          files,
          runner: gated,
          signal: deps.signal,
        }),
      );
    } catch {
      results.push({
        check,
        status: "unavailable",
        reason: REASONS.executionFailed,
        summary: "check failed unexpectedly",
        findings: 0,
        detail: null,
      });
    }
  }

  const rendered = renderVerificationReport({
    scope,
    checks: results,
    permissionNote,
    changedNote: notes.length ? `Scope: ${notes.join("; ")}.` : null,
  });
  return {
    scope,
    checks: results,
    status: rendered.status,
    findings: findingsTotal(results),
    text: rendered.text,
  };
}
```

Remove the unused `aggregateStatus` import if TypeScript flags it; only `findingsTotal` and the report's status are needed.

### Step 3: Verify

```bash
npm run typecheck
npx vitest run test/verify.test.ts
```

The test that inspects PHPUnit arguments is the contract for the roadmap exit gate "never passes production paths as test paths".

---

## Task 8: Record verification metrics

**Goal:** Persist normalized verification outcomes in the existing v3 document without inventing a second metrics store.

**Files:**

- Modify: `src/verify/types.ts` (add `isAggregateStatus`), `src/metrics/store.ts`, `src/metrics/format.ts`
- Test: `test/metrics-verification.test.ts`, update `test/metrics-v3.test.ts`, `test/metrics-format.test.ts`

### Step 1: Extend the verification type with a last-run status

The spec's `VerificationMetrics` interface lists counters and `lastRunAt` only. The `/php-toolkit-status` surface needs the last aggregate status, so this plan adds one backward-compatible field, `lastStatus`. Old documents migrate with `lastStatus: null`.

Add to `src/verify/types.ts`:

```ts
export function isAggregateStatus(value: unknown): value is AggregateStatus {
  return (
    value === "passed" ||
    value === "failed" ||
    value === "partial" ||
    value === "unavailable" ||
    value === "error"
  );
}
```

In `src/metrics/store.ts`:

```ts
import type { AggregateStatus, CheckResult } from "../verify/types.js";
import { isAggregateStatus } from "../verify/types.js";

export interface VerificationMetrics {
  runs: number;
  /** Aggregate run counters (mutually exclusive). */
  passed: number;
  failed: number;
  partial: number;
  unavailable: number;
  error: number;
  /** Per-check counters for non-terminal statuses. */
  warning: number;
  skipped: number;
  timedOut: number;
  cancelled: number;
  findings: number;
  lastRunAt: string | null;
  /** Aggregate status of the most recent run; null when never run. */
  lastStatus: AggregateStatus | null;
}
```

`emptyVerificationMetrics` gains `lastStatus: null`.

`migrateVerification` gains:

```ts
result.lastStatus = isAggregateStatus(candidate.lastStatus) ? candidate.lastStatus : null;
```

### Step 2: Add the metrics delta wiring

In `src/metrics/store.ts`:

```ts
export type MetricsDelta = {
  tools: Record<string, { runs: number; ok: number; error: number; findings: number; lastUsedAt: string; lastStatus: ToolRunStatus | null }>;
  commands: Record<string, { count: number; lastUsedAt: string }>;
  triggerHits: number;
  routing: RoutingMetrics;
  verification: VerificationMetrics;
};

function emptyDelta(): MetricsDelta {
  return {
    tools: {},
    commands: {},
    triggerHits: 0,
    routing: emptyRoutingMetrics(),
    verification: emptyVerificationMetrics(),
  };
}

function isEmptyVerification(verification: VerificationMetrics): boolean {
  return (
    verification.runs === 0 &&
    verification.passed === 0 &&
    verification.failed === 0 &&
    verification.partial === 0 &&
    verification.unavailable === 0 &&
    verification.error === 0 &&
    verification.warning === 0 &&
    verification.skipped === 0 &&
    verification.timedOut === 0 &&
    verification.cancelled === 0 &&
    verification.findings === 0 &&
    verification.lastRunAt === null &&
    verification.lastStatus === null
  );
}
```

Add `verification` to the `isEmptyDelta` conjunction and to `mergeDelta`'s return.

Add a merge helper:

```ts
function mergeVerification(a: VerificationMetrics, b: VerificationMetrics): VerificationMetrics {
  const laterRun = (a.lastRunAt ?? "") > (b.lastRunAt ?? "") ? a : b;
  return {
    runs: a.runs + b.runs,
    passed: a.passed + b.passed,
    failed: a.failed + b.failed,
    partial: a.partial + b.partial,
    unavailable: a.unavailable + b.unavailable,
    error: a.error + b.error,
    warning: a.warning + b.warning,
    skipped: a.skipped + b.skipped,
    timedOut: a.timedOut + b.timedOut,
    cancelled: a.cancelled + b.cancelled,
    findings: a.findings + b.findings,
    lastRunAt: laterRun.lastRunAt,
    lastStatus: laterRun.lastStatus,
  };
}
```

Use it in `applyDelta`:

```ts
verification: mergeVerification(base.verification ?? emptyVerificationMetrics(), delta.verification),
```

and in `mergeDelta`:

```ts
verification: mergeVerification(a.verification, b.verification),
```

Add the recorder:

```ts
async recordVerification(input: {
  status: AggregateStatus;
  checks: readonly CheckResult[];
  findings: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const verification = this.delta.verification;
  verification.runs += 1;
  verification[input.status] += 1;
  for (const check of input.checks) {
    if (check.status === "warning") verification.warning += 1;
    else if (check.status === "skipped") verification.skipped += 1;
    else if (check.status === "timed_out") verification.timedOut += 1;
    else if (check.status === "cancelled") verification.cancelled += 1;
  }
  verification.findings += nonNegative(input.findings);
  verification.lastRunAt = now;
  verification.lastStatus = input.status;
  this.markDirty();
}
```

### Step 3: Render the verification section in `php_metrics`

Add to `src/metrics/format.ts`:

```ts
function verificationLines(metrics: PhpToolkitMetrics): string[] {
  const verification = metrics.verification;
  if (verification.runs === 0) return ["    (no verification has run yet)"];
  return [
    `    runs ${verification.runs}   passed ${verification.passed}   failed ${verification.failed}   partial ${verification.partial}`,
    `    checks: warning ${verification.warning}   skipped ${verification.skipped}   timed out ${verification.timedOut}   cancelled ${verification.cancelled}`,
    `    findings ${verification.findings}   last ${formatTimestamp(verification.lastRunAt ?? "")} (${verification.lastStatus ?? "unknown"})`,
  ];
}
```

Insert between the routing and impact sections:

```ts
    "  Verification",
    ...verificationLines(m),
    "",
```

### Step 4: Write the metrics tests

Create `test/metrics-verification.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MetricsStore,
  deserialize,
  mergeDelta,
  type MetricsDelta,
  type MetricsProject,
  type MetricsStorage,
  emptyVerificationMetrics,
} from "../src/metrics/store.js";
import type { AggregateStatus, CheckResult } from "../src/verify/types.js";

const project: MetricsProject = { name: "demo", path: "/repo/demo" };

function memoryStorage(): MetricsStorage & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: async (key) => entries.get(key),
    set: async (key, value) => {
      entries.set(key, value);
    },
    remove: async (key) => {
      entries.delete(key);
    },
    scan: async ({ prefix, after, limit }) => ({
      entries: [...entries.entries()]
        .filter(([key]) => key.startsWith(prefix) && (!after || key > after))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, limit ?? 100)
        .map(([key, value]) => ({ key, value })),
    }),
  };
}

function check(status: CheckResult["status"], findings = 0): CheckResult {
  return { check: "lint", status, reason: null, summary: "", findings, detail: null };
}

describe("recordVerification", () => {
  it("records the aggregate status and per-check non-terminal statuses", async () => {
    const store = new MetricsStore(memoryStorage(), project);
    await store.recordVerification({
      status: "partial",
      checks: [check("passed"), check("skipped"), check("warning"), check("timed_out"), check("cancelled")],
      findings: 4,
    });
    const verification = store.getSnapshot().verification;
    expect(verification).toMatchObject({
      runs: 1,
      partial: 1,
      skipped: 1,
      warning: 1,
      timedOut: 1,
      cancelled: 1,
      findings: 4,
      lastStatus: "partial",
    });
    expect(verification.lastRunAt).not.toBeNull();
  });

  it("keeps aggregate counters mutually exclusive", async () => {
    const store = new MetricsStore(memoryStorage(), project);
    const statuses: AggregateStatus[] = ["passed", "failed", "unavailable", "error"];
    for (const status of statuses) {
      await store.recordVerification({ status, checks: [check(status === "passed" ? "passed" : "failed")], findings: 1 });
    }
    expect(store.getSnapshot().verification).toMatchObject({
      runs: 4,
      passed: 1,
      failed: 1,
      unavailable: 1,
      error: 1,
      partial: 0,
      findings: 4,
      lastStatus: "error",
    });
  });

  it("persists and reloads verification counts", async () => {
    const storage = memoryStorage();
    const first = new MetricsStore(storage, project);
    await first.recordVerification({ status: "failed", checks: [check("failed", 2)], findings: 2 });
    await first.flush();

    const second = new MetricsStore(storage, project);
    await second.init();
    expect(second.getSnapshot().verification).toMatchObject({
      runs: 1,
      failed: 1,
      findings: 2,
      lastStatus: "failed",
    });
  });
});

describe("verification merge and migration", () => {
  it("sums counters and keeps the later last run", () => {
    const base: MetricsDelta = {
      tools: {},
      commands: {},
      triggerHits: 0,
      routing: {
        selections: {},
        activations: {},
        unactivated: {},
        intents: {},
        concerns: {},
        dropped: {},
        taskGenerations: 0,
        continuations: 0,
        resets: 0,
      },
      verification: {
        ...emptyVerificationMetrics(),
        runs: 1,
        passed: 1,
        findings: 2,
        lastRunAt: "2026-01-01T00:00:00.000Z",
        lastStatus: "passed",
      },
    };
    const delta: MetricsDelta = {
      ...base,
      verification: {
        ...emptyVerificationMetrics(),
        runs: 1,
        failed: 1,
        findings: 3,
        lastRunAt: "2026-01-02T00:00:00.000Z",
        lastStatus: "failed",
      },
    };
    expect(mergeDelta(base, delta).verification).toMatchObject({
      runs: 2,
      passed: 1,
      failed: 1,
      findings: 5,
      lastRunAt: "2026-01-02T00:00:00.000Z",
      lastStatus: "failed",
    });
  });

  it("migrates lastStatus and rejects an unknown value", () => {
    const known = deserialize({ version: 3, verification: { runs: 1, lastStatus: "failed" } }, project);
    expect(known.metrics.verification.lastStatus).toBe("failed");
    const unknown = deserialize({ version: 3, verification: { runs: 1, lastStatus: "weird" } }, project);
    expect(unknown.metrics.verification.lastStatus).toBeNull();
  });
});
```

Update `test/metrics-v3.test.ts`: add `lastStatus: null` to the empty verification `toEqual` object, add `lastStatus: "passed"` to the populated fixture, and assert it with `expect(metrics.verification).toMatchObject({ runs: 6, failed: 1, findings: 7, lastStatus: "passed" })`.

Update `test/metrics-format.test.ts`'s `metrics()` fixture with `lastStatus: null`, and add:

```ts
  it("summarizes verification runs and the last aggregate status", () => {
    const out = formatMetricsSnapshot(
      metrics({
        verification: {
          ...metrics().verification,
          runs: 3,
          passed: 1,
          failed: 1,
          partial: 1,
          skipped: 2,
          findings: 5,
          lastRunAt: "2026-10-21T09:20:00.000Z",
          lastStatus: "failed",
        },
      }),
    );
    expect(out).toContain("runs 3");
    expect(out).toContain("skipped 2");
    expect(out).toContain("findings 5");
    expect(out).toContain("(failed)");
  });
```

### Step 5: Verify

```bash
npm run typecheck
npx vitest run test/metrics-verification.test.ts test/metrics-v3.test.ts test/metrics-format.test.ts test/metrics-store.test.ts
```

---

## Task 9: Wire `php_verify`, the reminder and the status surfaces

**Goal:** Make the verification layer reachable from a real session: register the tool, resolve the session root, pass VCS status, enforce permissions, record metrics, remind on Build/Design/Test, and show the last run in status.

**Files:**

- Modify: `src/config.ts`, `src/context/parts.ts`, `src/status/toolkit-status.ts`, `src/index.ts`
- Test: `test/context-parts.test.ts`, `test/toolkit-status.test.ts`, `test/plugin-integration.test.ts`

### Step 1: Add the completion reminder

In `src/context/parts.ts`, change the signature and append the reminder after the skills line:

```ts
export function renderToolkitStatePart(
  context: RoutingRenderContext,
  options: { verification?: "remind" | "off" } = {},
): string {
  // ...existing lines...
  lines.push(
    `Skills: selected=${selected}; attached=${attached}; activated=${activated}; pending: ${pendingText}`,
  );
  const reminder =
    options.verification !== "off" &&
    state.activeIntents.some(
      (intent) => intent === "Build" || intent === "Design" || intent === "Test",
    );
  if (reminder) {
    lines.push(
      "Before declaring completion: run php_verify (scope: changed), or explicitly report which checks are unavailable and why. Never claim a feature works without evidence.",
    );
  }
  return lines.join("\n");
}
```

Update the context hook in `src/index.ts`:

```ts
event.system.push(
  statePart(renderToolkitStatePart(render, { verification: config.verification })),
);
```

Add tests to `test/context-parts.test.ts`:

```ts
function state(intents: string[]): never {
  return {
    taskGeneration: 1,
    mode: "risk",
    activeIntents: intents,
    activeConcerns: [],
    selectedSkills: [],
    attachedSkills: [],
    activatedSkills: new Set(),
    unactivatedSkills: [],
  } as never;
}

it("reminds Build, Design and Test tasks to verify", () => {
  for (const intent of ["Build", "Design", "Test"]) {
    const text = renderToolkitStatePart(
      { profile: { type: "application", frameworkHints: ["none"] } as never, state: state([intent]) },
      { verification: "remind" },
    );
    expect(text).toContain("Before declaring completion: run php_verify");
  }
});

it("does not remind Review, Debug or Maintain tasks", () => {
  for (const intent of ["Review", "Debug", "Maintain"]) {
    const text = renderToolkitStatePart(
      { profile: { type: "application", frameworkHints: ["none"] } as never, state: state([intent]) },
      { verification: "remind" },
    );
    expect(text).not.toContain("php_verify");
  }
});

it("removes the reminder when verification is off", () => {
  const text = renderToolkitStatePart(
    { profile: { type: "application", frameworkHints: ["none"] } as never, state: state(["Build"]) },
    { verification: "off" },
  );
  expect(text).not.toContain("php_verify");
});
```

In `src/config.ts`, replace the comment above `verification`:

```ts
  // Include the completion reminder for Build/Design/Test tasks.
  verification: "remind" | "off";
```

`architectureScan` keeps its reserved comment; `announceSelections` keeps its reserved comment.

### Step 2: Add the status line

Export the timestamp formatter from `src/metrics/format.ts`:

```ts
export function formatTimestamp(iso: string): string {
```

In `src/status/toolkit-status.ts`:

```ts
import type { VerificationMetrics } from "../metrics/store.js";
import { formatTimestamp } from "../metrics/format.js";

export interface ToolkitStatusInput {
  profile: ProjectProfile | null;
  state: SessionRoutingState | null;
  config: ToolkitConfig;
  verification?: VerificationMetrics | null;
}

function verificationLine(verification?: VerificationMetrics | null): string {
  if (!verification || verification.runs === 0 || !verification.lastRunAt) {
    return "  Verify: not run yet";
  }
  return `  Verify: last run ${formatTimestamp(verification.lastRunAt)} — ${
    verification.lastStatus ?? "unknown"
  } (${verification.runs} run(s), ${verification.findings} finding(s))`;
}
```

Replace `lines.push("  Verify: unavailable (Phase 3)")` with `lines.push(verificationLine(input.verification))`.

Extend `buildCurrentStatusSnapshot`'s input:

```ts
    verificationFor?: (root: string) => Promise<VerificationMetrics>;
```

and call the renderer with:

```ts
  return renderToolkitStatus({
    profile,
    state: view,
    config: input.config,
    verification: (await input.verificationFor?.(root)) ?? null,
  });
```

Update the no-location return to pass `verification: null`.

In `src/index.ts`, add this to the `buildCurrentStatusSnapshot(ctx, { ... })` call in the `php-toolkit-status` command handler. Await `init()` so a status read for a project whose document was not loaded at startup shows persisted verification counts rather than an empty snapshot:

```ts
verificationFor: async (root) => {
  const store = metrics.storeFor(root);
  await store.init().catch(() => {});
  return store.getSnapshot().verification;
},
```

Update the existing first test's assertion in `test/toolkit-status.test.ts` from `"Verify: unavailable (Phase 3)"` to `"Verify: not run yet"`, then add tests using a populated `VerificationMetrics` fixture:

```ts
it("shows the last verification run and aggregate status", () => {
  const text = renderToolkitStatus({
    profile: null,
    state: null,
    config: DEFAULT_TOOLKIT_CONFIG,
    verification: {
      runs: 2,
      passed: 1,
      failed: 1,
      warning: 0,
      skipped: 2,
      partial: 0,
      unavailable: 0,
      error: 0,
      timedOut: 0,
      cancelled: 0,
      findings: 3,
      lastRunAt: "2026-11-08T05:31:00.000Z",
      lastStatus: "failed",
    },
  });
  expect(text).toContain("Verify: last run 2026-11-08 05:31Z — failed");
});

it("says verification has not run yet", () => {
  const text = renderToolkitStatus({
    profile: null,
    state: null,
    config: DEFAULT_TOOLKIT_CONFIG,
  });
  expect(text).toContain("Verify: not run yet");
});
```

### Step 3: Register the tool

In `src/index.ts`, add imports:

```ts
import { phpVerify, type VerifyInput } from "./verify/verify.js";
import { VERIFICATION_CHECKS } from "./verify/types.js";
```

Change `tracked` so handlers also receive the session ID (needed for `php_verify`; existing handlers keep ignoring it):

```ts
    const tracked = <TInput>(
      name: string,
      run: (
        input: TInput,
        context: { signal: AbortSignal; sessionID: string },
      ) => Promise<ToolOutcome>,
    ) => {
      return async (input: unknown, context: { signal: AbortSignal; sessionID: string }) => {
        // ...existing metric attribution...
        const outcome = await run(input as TInput, context);
        // ...
      };
    };
```

Add the tool after `php_test` in the same `ctx.tool.transform` block:

```ts
            editor.add({
              name: "verify",
              description:
                "Run the project's own verification checks and return one report: lint, composer, tests, static analysis, style and architecture. Non-mutating: never installs dependencies, edits configuration or applies fixes; style checks are dry-run. scope=changed uses the host VCS working tree and maps production changes to tests; scope=all runs the full suite/analysis. Respects session command permissions; denied checks are reported as cancelled, never bypassed.",
              input: {
                type: "object",
                properties: {
                  directory: { type: "string" },
                  scope: { type: "string", enum: ["changed", "all"], default: "changed" },
                  checks: {
                    type: "array",
                    items: { type: "string", enum: [...VERIFICATION_CHECKS] },
                  },
                  paths: { type: "array", items: { type: "string" } },
                },
                additionalProperties: false,
              },
              options: { namespace: "php" },
              execute: tracked(
                "php_verify",
                async (input: VerifyInput, context) => {
                  let session = null;
                  try {
                    session = await ctx.session.get({ sessionID: context.sessionID });
                  } catch (err) {
                    console.warn(
                      `[php-toolkit] could not resolve the session for php_verify: ${(err as Error).message}`,
                    );
                  }
                  const sessionRoot = session?.location?.directory ?? dir;
                  const subpath = session?.subpath ?? null;
                  const report = await phpVerify(input, {
                    sessionRoot,
                    profileFor: (root) =>
                      profileCache.resolve(root, root === sessionRoot ? subpath : null),
                    vcsStatus: async (directory) => {
                      const status = await ctx.vcs.status({ location: { directory } });
                      return { data: status.data ?? [] };
                    },
                    permissionRules: session?.permissions ?? [],
                    signal: context.signal,
                  });
                  const scope = resolveProjectScope(sessionRoot, input.directory);
                  try {
                    await metrics.storeFor(scope).recordVerification({
                      status: report.status,
                      checks: report.checks,
                      findings: report.findings,
                    });
                  } catch (err) {
                    // Metrics are optional; never fail a verification report over them.
                    console.error(
                      `[php-toolkit] verification metrics failed: ${(err as Error).message}`,
                    );
                  }
                  // `tracked` records the tool outcome; a completed report is a
                  // successful run even when findings exist.
                  return {
                    text: report.text,
                    status: report.status === "error" ? "error" : "ok",
                    findings: report.findings,
                  };
                },
              ),
            });
```

### Step 4: Extend the integration fake context

In `test/plugin-integration.test.ts`:

- Add `vcs?: { data: Array<{ file: string; status: "added" | "deleted" | "modified" }> }` to `FakeOverrides`.
- Capture tool definitions in `fakePluginContext`:

```ts
  const tools: Array<{ name: string; input?: any; execute: (input: any, context: any) => Promise<any> }> = [];
  // ...
    tool: {
      transform: async (cb: any) => {
        cb({ namespace() {}, add(tool: any) { tools.push(tool); } });
        return { dispose: async () => {} };
      },
      hook: async () => ({ dispose: async () => {} }),
    },
    vcs: {
      status: async () => ({
        location: { directory: overrides.roots?.s1 ?? defaultRoot },
        data: overrides.vcs?.data ?? [],
      }),
    },
```

Return `tools` from the fake object.

Add integration tests:

```ts
it("registers php_verify with the documented input schema", async () => {
  const { fake, cleanup } = await setupPlugin();
  const verify = fake.tools.find((tool) => tool.name === "verify");
  expect(verify).toBeDefined();
  expect(verify!.input.properties.scope.enum).toEqual(["changed", "all"]);
  expect(verify!.input.properties.checks.items.enum).toEqual([
    "lint",
    "composer",
    "tests",
    "static",
    "style",
    "architecture",
  ]);
  await cleanup();
});

it("returns a verification report through the registered tool", async () => {
  const { fake, cleanup } = await setupPlugin({ vcs: { data: [] } });
  const verify = fake.tools.find((tool) => tool.name === "verify")!;
  const result = await verify.execute(
    { scope: "changed", checks: ["composer"] },
    { signal: new AbortController().signal, sessionID: "s1" },
  );
  expect(result.content).toContain("PHP verification (scope: changed)");
  expect(result.content).toContain("composer");
  await cleanup();
});
```

### Step 5: Verify

```bash
npm run typecheck
npx vitest run test/context-parts.test.ts test/toolkit-status.test.ts test/plugin-integration.test.ts
```

The integration test runs `composer` only, so it does not depend on PHP being installed in CI. The status test uses `DEFAULT_TOOLKIT_CONFIG`; import it from `src/config.js`.

---

## Task 10: Documentation, version and roadmap

**Goal:** Make the shipped surface discoverable and bump the package without rebuilding `dist/` yet.

**Files:**

- Modify: `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md`
- Do not rebuild `dist/` in this task; Task 11 does it once on the final source tip.

### Step 1: README

The existing `## Verify` section documents how to verify **this repository**, so keep it and add the tool documentation as `## Verification tool (php_verify)` after the `## What you get` list and before `## Reactive routing (0.3.0)`. Cover:

```markdown
## Verification tool (`php_verify`)

`php_verify` runs the checks the project actually has and returns one report.
It is on demand: it never blocks a response and never runs automatically.

- Checks: `lint`, `composer`, `tests`, `static`, `style`, `architecture`.
- `scope: "changed"` (default) uses the host VCS working tree (staged, unstaged and untracked files); `scope: "all"` runs the full suite/analysis.
- `paths` overrides the changed-file set for `lint`, `static` and `style` regardless of scope. Production paths are never passed to the test runner.
- Changed production files map to `{ClassName}Test.php` under the test roots; a missing mapping, an unmapped PHP change or a deleted source file runs the full suite and labels the check `tests:full-suite-fallback`.
- Missing tools and configuration are reported as `unavailable`; intentionally skipped work is `skipped` with a reason code. The aggregate is `passed` only when every requested check passed, and `partial` for mixed/skipped/warning/timed-out/cancelled results.
- The tool never installs dependencies, edits configuration or applies fixes. Style checks are dry-run. Tests and static analysis execute project code, so they inherit the host's permission model; denied or approval-gated commands are reported as cancelled and never bypassed.
- `verification: "off"` removes the Build/Design/Test completion reminder; the tool remains available.
```

Add `php_verify` to the tools list:

```markdown
  - `php_verify` — one normalized report for lint, composer, tests, static analysis, style and architecture; VCS-derived changed scope and test mapping; **executes project-configured tools** under session command permissions; never installs, edits or fixes
```

Add `"verification": "remind"` to the options JSON example, add an escape-hatch bullet, and remove `verification` from the reserved list:

```markdown
- `verification: "off"` removes the completion reminder for Build/Design/Test tasks.
```

```markdown
- `architectureScan` and `announceSelections` are reserved for later phases;
  the plugin parses them but they have no effect. Routing is always silent by
  default.
```

Add a `Verification` block to the `php_metrics` sample using the same shape Task 8 renders.

Update the `/php-toolkit-status` sample to include `Verify: last run ...`. Remove any "Phase 3" placeholder text.

### Step 2: CHANGELOG

Add a `0.4.0` section:

```markdown
## [0.4.0] - 2026-11-09

### Added

- `php_verify`: one deterministic report across lint, composer, tests, static analysis, style and architecture.
- VCS-derived changed scope through the host API, path overrides, production-to-test mapping and full-suite fallback.
- Command/shell permission-aware execution: denied or approval-required commands are cancelled, never bypassed.
- Build/Design/Test completion reminder, gated by `verification`.
- Verification metrics and `/php-toolkit-status` verification line.

### Changed

- `php_lint`, `composerValidate`, `php_static_analysis` and `php_test` accept an injected command runner and explicit paths internally; their registered tool inputs are unchanged.
- `VerificationMetrics` gains `lastStatus`; older documents migrate with `null`.

### Fixed

- Missing tooling is reported as `unavailable` instead of a silent skip; an empty changed list is `partial`, never `passed`.
```

### Step 3: Version bump

```bash
npm version 0.4.0 --no-git-tag-version
```

Confirm `package.json` and `package-lock.json` both say `0.4.0`.

### Step 4: Roadmap

In `docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md`:

- Change the Phase 3 plan row status from `Not created` to `Created`.
- Correct the Phase 2 plan row from `Not created` to `Created`: the plan exists and shipped in `0.3.0` (PR #11).
- Leave the Phase 3 exit-gate checkboxes unchecked until Task 11 has evidence.

### Step 5: Commit

```bash
git add README.md CHANGELOG.md package.json package-lock.json docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md
git commit -m "docs: document php_verify and bump to 0.4.0"
```

---

## Task 11: Full verification and acceptance

**Goal:** Prove the branch tip boots, tests, builds, matches `dist/`, and satisfies the Phase 3 exit gate.

**Files:**

- Modify: `dist/` (rebuilt), `docs/superpowers/plans/2026-11-04-reactive-engineering-phase-3-verification.md` (checkboxes), `docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md` (exit-gate checkboxes).

### Step 1: Run the suite from a clean install

```bash
npm ci
npm run typecheck
npm test
```

Expected: all test files pass, including the new `verify-*` and `metrics-verification` files.

### Step 2: Rebuild and commit `dist/`

```bash
npm run build
git add -A -- dist
git diff --cached --stat -- dist
git commit -m "chore: rebuild dist for 0.4.0"
git add -A -- dist && git diff --cached --exit-code -- dist
```

The last command must exit 0. If it fails, the committed `dist/` does not match the source tip; rebuild, commit, and rerun.

### Step 3: Plugin and package smoke tests

```bash
node -e "import('./dist/index.js').then((m) => { if (m.default.id !== 'php-toolkit') process.exit(1); console.log('plugin id ok') })"
npm pack --dry-run
```

Confirm the tarball includes `dist/verify/`, the new tool code and the existing skills; confirm the version is `0.4.0`.

### Step 4: Manual acceptance

1. Start a Build prompt against `fixtures/php-app` (or any PHP project) and confirm the state system part contains the `php_verify` completion reminder.
2. Set `verification: "off"` and confirm the reminder disappears.
3. Run `php_verify` on a project with no test/static/style tooling and confirm the report says `unavailable`/`scanner-unavailable` and never claims `passed`.
4. Run it on a project with a fake failing test and confirm the aggregate is `failed` and the failing test is attributed.
5. Confirm a denied `bash` rule produces `cancelled (permission:denied)` and the command is not spawned.

Record the results in the plan's acceptance checklist below.

### Step 5: Update the plan and roadmap checkboxes

- Mark the acceptance checklist below `[x]` once every line has evidence.
- Tick the Phase 3 exit-gate items in the roadmap once the evidence above exists.
- Leave the Phase 4 plan creation unchecked.
- Commit the documentation update:

```bash
git add docs/superpowers/plans/2026-11-04-reactive-engineering-phase-3-verification.md \
  docs/superpowers/plans/2026-11-04-reactive-engineering-roadmap.md
git commit -m "docs: mark the phase 3 verification plan complete"
```

### Step 6: Final state

```bash
git status --short
git log --oneline -5
```

The working tree must be clean, and the branch tip must contain the plan, source, tests, docs and rebuilt `dist/`.

### Acceptance checklist

- [x] `npm ci` clean.
- [x] `npm run typecheck` clean.
- [x] `npm test` green.
- [x] `npm run build` clean.
- [x] `git add -A -- dist && git diff --cached --exit-code -- dist` exits 0.
- [x] Plugin id smoke test passes.
- [x] `npm pack --dry-run` includes the verification build and reports `0.4.0`.
- [x] Changed scope never reports `passed` when the file list is indeterminate.
- [x] Production paths never reach the test runner.
- [x] Denied commands are cancelled and not spawned.
- [x] Deptrac only runs when configured; otherwise `skipped: scanner-unavailable`.
- [x] Build/Design/Test get the reminder; `verification: "off"` removes it.
- [x] `php_metrics` and `/php-toolkit-status` show verification runs.
- [x] Manual acceptance scenarios pass.

---

## Self-review

### Spec coverage

| Spec requirement | Where implemented |
| --- | --- |
| §10.1 input (`directory`, `scope`, `checks`, `paths`) | Task 7 `VerifyInput`, Task 9 tool schema |
| Six checks and detection rules | Tasks 5–6, `detectedChecks` |
| VCS changed scope, empty/deleted/unavailable semantics | Task 3 + Task 7 |
| Path override and outside-root rejection | Task 3 + Task 7 |
| Production-to-test mapping and full-suite fallback | Task 4 + Task 6 |
| Per-check and aggregate statuses | Task 2 |
| 24,000-character cap | Task 2 |
| Permission-aware execution adapter | Task 1 + Task 7 |
| Deptrac only when configured; scanner otherwise skipped | Task 6 |
| §10.2 completion reminder | Task 9 |
| §10.3 reuse of existing check functions, metrics | Tasks 1, 5–6, 8 |
| §13 `verification` option | Task 9 |
| §14 metrics and status line | Task 8 + Task 9 |
| §15 unit/integration tests and fixtures | Tasks 2–9 |
| Phase 3 exit gate | Task 11 |

### Placeholder scan

- No `TODO`, `TBD`, `implement later` or unbounded "similar to" steps.
- Every code block is either complete or names the exact existing function to extend.
- Every test step names the file and the assertion that must fail first.

### Type consistency

- `VerificationCheck`, `CheckStatus`, `AggregateStatus`, `CheckResult` and `VerificationReport` are defined once in `src/verify/types.ts` and imported everywhere else.
- `VerifyInput`/`VerifyDependencies` are the only orchestrator boundary; the plugin passes real session/VCS/permission data and tests inject fakes.
- `ToolOutcome.failure` is additive; existing tool consumers are unaffected.
- `VerificationMetrics.lastStatus` is additive; migration defaults it to `null`.

### Known trade-offs

- **`lastStatus` extension.** The spec's `VerificationMetrics` interface does not list it, but the status surface needs the last aggregate status. The field is backward compatible and migrated.
- **Permission matching is best-effort.** A command is matched against its full line, absolute path, basename and cwd-relative path. Hosts with only tool-level permissions report `permission:tool-level-only`; the tool never claims per-command approval it does not have.
- **Missing tools are `unavailable`, not `skipped`.** This follows the status table ("required tool or configuration is missing") even though the illustrative report shows a skipped style row. `skipped` is reserved for intentional non-execution (`no-changed-files`, `no-relevant-changes`, `scanner-unavailable`).
- **Test mapping is heuristic.** Any missing mapping or deleted source triggers the full suite and an explicit `tests:full-suite-fallback` reason; targeted coverage is never implied.
- **Symlinks are not followed** during scope/test scans, preventing out-of-root traversal and duplicate linting.
- **Architecture without Deptrac is `scanner-unavailable`** even when `php-toolkit.json` boundaries exist, matching the roadmap exit gate; Phase 5 adds the adapter without changing the report contract.
- **Verification metrics are per-project** like the existing tool metrics; a session verifying another project writes to that project's document.


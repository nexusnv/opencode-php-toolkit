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

import { authorizedRunner, execFileRunner } from "../tools/runner.js";
import { findingsTotal } from "./aggregate.js";
import { architectureCheck, architectureDetected } from "./checks/architecture.js";
import { composerCheck } from "./checks/composer.js";
import { lintCheck } from "./checks/lint.js";
import { staticCheck } from "./checks/static.js";
import { styleCheck, styleTool } from "./checks/style.js";
import { testsCheck, testsDetected } from "./checks/tests.js";
import { canonicalVerificationRoot, findWorktreeRoot, listProjectPhpFiles, normalizeVcsStatus, pathsOverride, resolveVerificationRoot, } from "./changed.js";
import { commandRules, evaluateCommand, toCommandDecision } from "./permissions.js";
import { renderVerificationReport } from "./report.js";
import { REASONS, VERIFICATION_CHECKS, isVerificationCheck, } from "./types.js";
const ADAPTERS = {
    lint: lintCheck,
    composer: composerCheck,
    tests: testsCheck,
    static: staticCheck,
    style: styleCheck,
    architecture: architectureCheck,
};
const CHANGED_FILE_CHECKS = new Set(["lint", "tests", "static", "style"]);
/** Detected checks in the fixed report order. `lint` is always available. */
export function detectedChecks(profile) {
    const checks = ["lint"];
    if (profile.hasComposerJson)
        checks.push("composer");
    if (testsDetected(profile))
        checks.push("tests");
    if (profile.tools.phpstan ||
        profile.tools.psalm ||
        Boolean(profile.configFiles?.phpstan) ||
        Boolean(profile.configFiles?.psalm)) {
        checks.push("static");
    }
    if (styleTool(profile))
        checks.push("style");
    if (architectureDetected(profile))
        checks.push("architecture");
    return checks;
}
function errorReport(scope, message) {
    const rendered = renderVerificationReport({
        scope,
        checks: [],
        permissionNote: null,
        changedNote: null,
        error: message,
    });
    return { scope, checks: [], status: rendered.status, findings: 0, text: rendered.text };
}
async function readChangedScope(deps, root) {
    try {
        const status = await deps.vcsStatus(root);
        const worktreeRoot = await findWorktreeRoot(root);
        return normalizeVcsStatus(root, status.data ?? [], worktreeRoot);
    }
    catch {
        return { source: "unavailable", files: [], deleted: [], truncated: false, note: null };
    }
}
export async function phpVerify(input, deps) {
    const scope = input.scope ?? "changed";
    if (scope !== "changed" && scope !== "all") {
        return errorReport("changed", `invalid scope: ${String(input.scope)}`);
    }
    if (input.checks !== undefined) {
        if (!Array.isArray(input.checks) ||
            input.checks.length === 0 ||
            !input.checks.every(isVerificationCheck)) {
            return errorReport(scope, "checks must be a non-empty array of lint, composer, tests, static, style, architecture");
        }
    }
    if (input.paths !== undefined && (!Array.isArray(input.paths) || input.paths.some((p) => typeof p !== "string"))) {
        return errorReport(scope, "paths must be an array of strings");
    }
    const rootResult = resolveVerificationRoot(deps.sessionRoot, input.directory);
    if ("error" in rootResult)
        return errorReport(scope, rootResult.error);
    const canonical = await canonicalVerificationRoot(deps.sessionRoot, rootResult.root);
    if ("error" in canonical)
        return errorReport(scope, canonical.error);
    const root = canonical.root;
    const profile = await deps.profileFor(root);
    const provided = input.paths && input.paths.length > 0
        ? await pathsOverride(root, input.paths, root)
        : null;
    if (provided && "error" in provided)
        return errorReport(scope, provided.error);
    const notes = [];
    let changed;
    let files;
    if (provided) {
        // Spec §10.1: explicit paths override the changed-file set for lint,
        // static and style regardless of scope. Tests still use VCS mapping for
        // changed scope and the full suite for scope all.
        changed =
            scope === "changed"
                ? await readChangedScope(deps, root)
                : { source: "vcs", files: [], deleted: [], truncated: false, note: null };
        files = provided.files;
        if (provided.ignored > 0)
            notes.push(`${provided.ignored} non-PHP path(s) ignored`);
        if (scope === "changed") {
            if (changed.source === "unavailable") {
                notes.push('changed scope unavailable for test mapping; use scope: "all"');
            }
            else if (changed.note) {
                notes.push(changed.note);
            }
        }
    }
    else if (scope === "all") {
        changed = { source: "vcs", files: [], deleted: [], truncated: false, note: null };
        const list = await listProjectPhpFiles(root, profile);
        files = list.files;
        if (list.truncated)
            notes.push(`scope truncated to ${files.length} PHP files`);
        if (list.outsideRoots > 0) {
            notes.push(`${list.outsideRoots} source/test root(s) outside the verification root were ignored`);
        }
    }
    else {
        changed = await readChangedScope(deps, root);
        files = changed.files.filter((file) => file.endsWith(".php"));
        if (changed.source === "unavailable") {
            notes.push('changed scope unavailable from the host VCS; use scope: "all"');
        }
        else if (changed.note) {
            notes.push(changed.note);
        }
    }
    const rules = deps.permissionRules ?? [];
    const permissionNote = commandRules(rules).length === 0 ? "permission:tool-level-only" : null;
    const gated = authorizedRunner(deps.runner ?? execFileRunner, (cmd, args, cwd) => toCommandDecision(evaluateCommand(rules, cmd, args, cwd)));
    const requested = input.checks ?? detectedChecks(profile);
    const ordered = VERIFICATION_CHECKS.filter((check) => requested.includes(check));
    const changedUnavailable = scope === "changed" && !provided && changed.source === "unavailable";
    const emptyChanged = scope === "changed" &&
        !provided &&
        changed.source === "vcs" &&
        changed.files.length === 0 &&
        changed.deleted.length === 0;
    const results = [];
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
            results.push(await ADAPTERS[check]({
                root,
                profile,
                scope,
                changed,
                files,
                pathOverride: provided !== null,
                runner: gated,
                signal: deps.signal,
            }));
        }
        catch {
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
//# sourceMappingURL=verify.js.map
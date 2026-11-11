import { runTestSuite } from "../../tools/php-tools.js";
import { selectTests } from "../test-selection.js";
import { REASONS } from "../types.js";
import { failed, failureResult, passed, skipped, unavailable, warning, } from "./shared.js";
export function testsDetected(profile) {
    return Boolean(profile.tools.phpunit ||
        profile.tools.pest ||
        profile.configFiles?.phpunit ||
        profile.configFiles?.pest);
}
function mapTests(outcome, mode, reason) {
    const failure = failureResult("tests", outcome);
    if (failure)
        return failure;
    let result;
    if (!outcome.summary) {
        // A merged multi-file run can have findings from one file and no report
        // from another; never downgrade known failures to a warning.
        result =
            outcome.findings > 0
                ? failed("tests", `${outcome.findings} failing (${mode}; incomplete report)`, outcome.findings, outcome.text)
                : warning("tests", REASONS.noTestReport, `runner exited 0 without a JUnit report (${mode})`, 0, outcome.text);
    }
    else if (outcome.summary.failures + outcome.summary.errors > 0) {
        const failing = outcome.summary.failures + outcome.summary.errors;
        result = failed("tests", `${failing} failing (${mode})`, failing, outcome.text);
    }
    else if (outcome.summary.skipped > 0) {
        result = warning("tests", REASONS.testsSkipped, `${outcome.summary.tests} passed, ${outcome.summary.skipped} skipped (${mode})`, 0, outcome.text);
    }
    else {
        result = passed("tests", `${outcome.summary.tests} test(s), ${outcome.summary.assertions} assertion(s) (${mode})`);
    }
    return reason ? { ...result, reason } : result;
}
export async function testsCheck(env) {
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
//# sourceMappingURL=tests.js.map
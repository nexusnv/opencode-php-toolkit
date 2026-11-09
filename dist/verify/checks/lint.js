import { phpLint } from "../../tools/php-tools.js";
import { REASONS } from "../types.js";
import { failed, failureResult, passed, skipped } from "./shared.js";
/** Matches php_lint's own output cap so the summary is honest. */
export const LINT_FILE_CAP = 20;
export async function lintCheck(env) {
    if (env.files.length === 0)
        return skipped("lint", REASONS.noRelevantChanges, "no PHP files to lint");
    const files = env.files.slice(0, LINT_FILE_CAP);
    const note = env.files.length > files.length ? ` (first ${files.length} of ${env.files.length})` : "";
    const outcome = await phpLint(files, env.root, env.signal, env.runner);
    const failure = failureResult("lint", outcome);
    if (failure)
        return failure;
    if (outcome.findings === 0)
        return passed("lint", `${files.length} file(s), 0 errors${note}`);
    return failed("lint", `${outcome.findings} parse error(s)${note}`, outcome.findings, outcome.text);
}
//# sourceMappingURL=lint.js.map
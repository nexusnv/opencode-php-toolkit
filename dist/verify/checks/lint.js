import { phpLint } from "../../tools/php-tools.js";
import { REASONS } from "../types.js";
import { failed, failureResult, passed, skipped } from "./shared.js";
/** Matches php_lint's own output cap; the adapter batches around it. */
export const LINT_FILE_CAP = 20;
export async function lintCheck(env) {
    if (env.files.length === 0)
        return skipped("lint", REASONS.noRelevantChanges, "no PHP files to lint");
    let findings = 0;
    let failure = null;
    const texts = [];
    for (let index = 0; index < env.files.length; index += LINT_FILE_CAP) {
        const files = env.files.slice(index, index + LINT_FILE_CAP);
        const outcome = await phpLint(files, env.root, env.signal, env.runner);
        findings += outcome.findings;
        texts.push(outcome.text);
        failure ??= failureResult("lint", outcome);
    }
    const detail = texts.join("\n\n").slice(0, 20000);
    if (failure && findings === 0)
        return failure;
    if (findings === 0)
        return passed("lint", `${env.files.length} file(s), 0 errors`);
    const incomplete = failure ? ", run incomplete" : "";
    return failed("lint", `${findings} parse error(s)${incomplete}`, findings, detail);
}
//# sourceMappingURL=lint.js.map
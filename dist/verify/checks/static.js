import { phpStaticAnalysis } from "../../tools/php-tools.js";
import { REASONS } from "../types.js";
import { failed, failureResult, passed, skipped, unavailable, warning, } from "./shared.js";
export const MAX_STATIC_FILES = 200;
function analyzer(env) {
    // Spec §10.1: detect from the analyzer config or the dev dependency, not
    // only from `composer.json` require-dev. `Boolean` keeps partial test
    // profiles without `configFiles` safe.
    if (env.profile.tools.phpstan || Boolean(env.profile.configFiles?.phpstan))
        return "phpstan";
    if (env.profile.tools.psalm || Boolean(env.profile.configFiles?.psalm))
        return "psalm";
    return null;
}
export async function staticCheck(env) {
    const selection = analyzer(env);
    if (!selection) {
        return unavailable("static", REASONS.notInstalled, "PHPStan/Psalm not installed");
    }
    const targeted = env.scope === "changed" || env.pathOverride;
    if (env.files.length === 0 && targeted) {
        return skipped("static", REASONS.noRelevantChanges, "no PHP files to analyse");
    }
    const truncated = env.files.length > MAX_STATIC_FILES;
    const files = env.files.slice(0, MAX_STATIC_FILES);
    const note = truncated ? `, first ${files.length} of ${env.files.length}` : "";
    const outcome = await phpStaticAnalysis(env.root, env.signal, selection, {
        runner: env.runner,
        paths: targeted ? files : undefined,
    });
    const failure = failureResult("static", outcome);
    if (failure)
        return failure;
    const label = selection === "phpstan" ? "PHPStan" : "Psalm";
    const mode = targeted ? `${files.length} file(s)${note}` : "full analysis";
    if (outcome.findings === 0) {
        if (truncated) {
            return warning("static", REASONS.scopeTruncated, `0 errors (${label}, ${mode}); ${env.files.length - files.length} file(s) not analysed`);
        }
        return passed("static", `0 errors (${label}, ${mode})`);
    }
    return failed("static", `${outcome.findings} error(s) (${label}, ${mode})`, outcome.findings, outcome.text);
}
//# sourceMappingURL=static.js.map
import { composerValidate } from "../../tools/php-tools.js";
import { REASONS } from "../types.js";
import { failed, failureResult, passed, unavailable } from "./shared.js";
export async function composerCheck(env) {
    if (!env.profile.hasComposerJson) {
        return unavailable("composer", REASONS.notConfigured, "composer.json not found");
    }
    const outcome = await composerValidate(env.root, env.signal, env.runner);
    const failure = failureResult("composer", outcome);
    if (failure)
        return failure;
    if (outcome.findings === 0)
        return passed("composer", "valid");
    return failed("composer", "invalid composer.json", outcome.findings, outcome.text);
}
//# sourceMappingURL=composer.js.map
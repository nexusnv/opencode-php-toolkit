import { join } from "node:path";
import { pathExists, runFailure, unavailable } from "./shared.js";
const MAX_SCRIPT_OUTPUT = 4_000;
const SCRIPT_TIMEOUT_MS = 10 * 60 * 1000;
function boundedOutput(stdout, stderr) {
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    if (!output)
        return null;
    return output.length > MAX_SCRIPT_OUTPUT
        ? `${output.slice(0, MAX_SCRIPT_OUTPUT)}\n… output truncated`
        : output;
}
/** Executes one validated, project-defined Composer script as a whole-project check. */
export async function composerScriptCheck(env, check, scriptName) {
    if (!(await pathExists(join(env.root, "composer.json")))) {
        return unavailable(check, "not-configured", "Composer manifest is not available");
    }
    const result = await env.runner.run("composer", ["run-script", "--no-interaction", scriptName], env.root, SCRIPT_TIMEOUT_MS, env.signal);
    const failure = runFailure(check, result, "Composer is not installed");
    if (failure)
        return failure;
    const detail = boundedOutput(result.stdout, result.stderr);
    const semantics = `whole-project Composer script '${scriptName}' (project-defined code; may have side effects)`;
    if (result.ok) {
        return {
            check,
            status: "passed",
            reason: null,
            summary: `${semantics} passed`,
            findings: 0,
            detail,
        };
    }
    return {
        check,
        status: "failed",
        reason: null,
        summary: `${semantics} failed`,
        findings: 0,
        detail,
    };
}
//# sourceMappingURL=composer-script.js.map
import { join } from "node:path";
import { REASONS } from "../types.js";
import { failed, passed, pathExists, runFailure, skipped, unavailable, } from "./shared.js";
export const MAX_STYLE_FILES = 200;
export function styleTool(profile) {
    if (profile.tools.csFixer || Boolean(profile.configFiles?.csFixer))
        return "cs-fixer";
    if (profile.tools.phpcs || Boolean(profile.configFiles?.phpcs))
        return "phpcs";
    return null;
}
function countPhpcsFindings(text) {
    const match = text.match(/A TOTAL OF (\d+) ERRORS? AND (\d+) WARNINGS?/i);
    if (!match)
        return 1;
    const total = Number(match[1]) + Number(match[2]);
    return total > 0 ? total : 1;
}
export async function styleCheck(env) {
    if (env.files.length === 0) {
        return skipped("style", REASONS.noRelevantChanges, "no PHP files to check");
    }
    const tool = styleTool(env.profile);
    if (!tool)
        return unavailable("style", REASONS.notInstalled, "php-cs-fixer/PHPCS not installed");
    const files = env.files.slice(0, MAX_STYLE_FILES);
    const note = env.files.length > files.length ? ` (first ${files.length} of ${env.files.length})` : "";
    if (tool === "cs-fixer") {
        const binary = join(env.root, "vendor/bin/php-cs-fixer");
        if (!(await pathExists(binary))) {
            return unavailable("style", REASONS.notInstalled, "php-cs-fixer not installed");
        }
        const result = await env.runner.run(binary, ["fix", "--dry-run", "--diff", "--using-cache=no", "--path-mode=intersection", ...files], env.root, 120_000, env.signal);
        const failure = runFailure("style", result, "php-cs-fixer not installed");
        if (failure)
            return failure;
        if (result.ok)
            return passed("style", `${files.length} file(s) clean${note}`);
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
    const result = await env.runner.run(binary, ["--report=summary", "--no-colors", ...files], env.root, 120_000, env.signal);
    const failure = runFailure("style", result, "PHPCS not installed");
    if (failure)
        return failure;
    const text = `${result.stdout}\n${result.stderr}`.trim();
    if (result.ok)
        return passed("style", `${files.length} file(s) clean${note}`);
    if (result.code === 1) {
        const count = countPhpcsFindings(text);
        return failed("style", `${count} coding-standard finding(s)${note}`, count, text);
    }
    return unavailable("style", REASONS.executionFailed, "PHPCS could not run", text);
}
//# sourceMappingURL=style.js.map
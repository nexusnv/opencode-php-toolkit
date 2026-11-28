import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
const EMPTY_CONFIG = {
    architecture: null,
    routing: { disableSkills: [], extraSkills: [] },
    verification: null,
};
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringList(value) {
    if (!Array.isArray(value))
        return null;
    const values = value.map((item) => (typeof item === "string" ? item.trim() : ""));
    return values.every((item) => item.length > 0) ? [...new Set(values)] : null;
}
function safeRelativePath(path) {
    return (path.length > 0 &&
        !isAbsolute(path) &&
        !/^[A-Za-z]:[\\/]/.test(path) &&
        !path.split(/[\\/]+/).includes(".."));
}
function parseArchitecture(value, diagnostics) {
    if (!isRecord(value)) {
        diagnostics.push("architecture must be an object; boundary checks are disabled");
        return null;
    }
    const before = diagnostics.length;
    let layers = {};
    const rawLayers = value.layers ?? {};
    if (!isRecord(rawLayers)) {
        diagnostics.push("architecture.layers must be an object; boundary checks are disabled");
    }
    else {
        const names = Object.keys(rawLayers);
        for (const [name, rawLayer] of Object.entries(rawLayers)) {
            if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
                diagnostics.push(`architecture layer name is invalid: ${name}`);
                continue;
            }
            if (!isRecord(rawLayer)) {
                diagnostics.push(`architecture layer ${name} must be an object`);
                continue;
            }
            const namespaces = stringList(rawLayer.namespaces);
            const mayDependOn = rawLayer.mayDependOn === undefined ? [] : stringList(rawLayer.mayDependOn);
            if (!namespaces ||
                namespaces.some((namespace) => !/^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*\\$/.test(namespace))) {
                diagnostics.push(`architecture layer ${name} needs namespace prefixes ending in \\`);
                continue;
            }
            if (!mayDependOn) {
                diagnostics.push(`architecture layer ${name}.mayDependOn must be a list of layer names`);
                continue;
            }
            if (mayDependOn.some((dependency) => dependency === name || !names.includes(dependency))) {
                diagnostics.push(`architecture layer ${name}.mayDependOn references an unknown or identical layer`);
                continue;
            }
            layers[name] = { namespaces, mayDependOn };
        }
        const namespaceOwners = new Map();
        for (const [name, layer] of Object.entries(layers)) {
            for (const namespace of layer.namespaces) {
                const owner = namespaceOwners.get(namespace);
                if (owner)
                    diagnostics.push(`namespace ${namespace} is assigned to both ${owner} and ${name}`);
                else
                    namespaceOwners.set(namespace, name);
            }
        }
    }
    const rawExclude = value.exclude === undefined ? [] : stringList(value.exclude);
    if (!rawExclude || rawExclude.some((path) => !safeRelativePath(path))) {
        diagnostics.push("architecture.exclude must contain safe project-relative paths");
    }
    if (diagnostics.length > before)
        return null;
    const exclude = (rawExclude ?? []).map((path) => normalize(path).replaceAll("\\", "/"));
    return { layers, exclude };
}
export async function readProjectToolkitConfig(root) {
    let raw;
    try {
        raw = await readFile(join(root, "php-toolkit.json"), "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return { config: EMPTY_CONFIG, diagnostics: [], present: false };
        }
        return {
            config: EMPTY_CONFIG,
            diagnostics: ["php-toolkit.json could not be read; project configuration is disabled"],
            present: true,
        };
    }
    const diagnostics = [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        return {
            config: EMPTY_CONFIG,
            diagnostics: [`php-toolkit.json is malformed: ${error.message}`],
            present: true,
        };
    }
    if (!isRecord(parsed)) {
        return {
            config: EMPTY_CONFIG,
            diagnostics: ["php-toolkit.json must contain a JSON object"],
            present: true,
        };
    }
    const knownRootKeys = new Set(["architecture", "routing", "verification"]);
    for (const key of Object.keys(parsed)) {
        if (!knownRootKeys.has(key))
            diagnostics.push(`unknown php-toolkit.json key ignored: ${key}`);
    }
    let architecture = null;
    if (parsed.architecture !== undefined)
        architecture = parseArchitecture(parsed.architecture, diagnostics);
    let routing = EMPTY_CONFIG.routing;
    if (parsed.routing !== undefined) {
        if (!isRecord(parsed.routing)) {
            diagnostics.push("routing must be an object; routing overrides are ignored");
        }
        else {
            const disableSkills = parsed.routing.disableSkills === undefined ? [] : stringList(parsed.routing.disableSkills);
            const extraSkills = parsed.routing.extraSkills === undefined ? [] : stringList(parsed.routing.extraSkills);
            if (!disableSkills || !extraSkills) {
                diagnostics.push("routing skill overrides must be lists of non-empty strings");
            }
            else {
                routing = { disableSkills, extraSkills };
            }
        }
    }
    let verification = null;
    if (parsed.verification !== undefined) {
        if (!isRecord(parsed.verification)) {
            diagnostics.push("verification must be an object; verification overrides are ignored");
        }
        else {
            const allowedVerificationKeys = new Set(["composerScripts"]);
            for (const key of Object.keys(parsed.verification)) {
                if (!allowedVerificationKeys.has(key))
                    diagnostics.push(`unknown verification key ignored: ${key}`);
            }
            const composerScripts = {};
            const rawScripts = parsed.verification.composerScripts;
            if (rawScripts !== undefined) {
                if (!isRecord(rawScripts)) {
                    diagnostics.push("verification.composerScripts must be an object");
                }
                else {
                    let composerNames = null;
                    for (const [check, scriptName] of Object.entries(rawScripts)) {
                        if (check !== "tests" && check !== "static" && check !== "style") {
                            diagnostics.push(`verification.composerScripts has unsupported check key: ${check}`);
                            continue;
                        }
                        if (typeof scriptName !== "string" || scriptName.trim() === "") {
                            diagnostics.push(`verification.composerScripts.${check} must be a non-empty script name`);
                            continue;
                        }
                        composerNames ??= await readComposerScriptNames(root);
                        if (!composerNames.has(scriptName.trim())) {
                            diagnostics.push(`verification.composerScripts.${check} must name an existing Composer script`);
                            continue;
                        }
                        composerScripts[check] = scriptName.trim();
                    }
                }
            }
            verification = { composerScripts };
        }
    }
    return {
        config: { architecture, routing, verification },
        diagnostics,
        present: true,
    };
}
async function readComposerScriptNames(root) {
    try {
        const parsed = JSON.parse(await readFile(join(root, "composer.json"), "utf8"));
        if (!isRecord(parsed) || !isRecord(parsed.scripts))
            return new Set();
        return new Set(Object.keys(parsed.scripts));
    }
    catch {
        return new Set();
    }
}
//# sourceMappingURL=project-config.js.map
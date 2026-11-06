import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { PKG_ROOT } from "./content.js";
import { detectPhpProject } from "./tools/detect.js";
const PACKAGE_VERSION = JSON.parse(await readFile(join(PKG_ROOT, "package.json"), "utf8")).version;
const CONFIG_PROBES = {
    phpunit: ["phpunit.xml", "phpunit.xml.dist"],
    pest: ["Pest.php"],
    phpstan: ["phpstan.neon", "phpstan.neon.dist", "phpstan.dist.neon"],
    psalm: ["psalm.xml", "psalm.xml.dist"],
    phpcs: ["phpcs.xml", "phpcs.xml.dist", ".phpcs.xml", ".phpcs.xml.dist"],
    csFixer: [".php-cs-fixer.php", ".php-cs-fixer.dist.php"],
    deptrac: ["deptrac.yaml", "deptrac.yml"],
    architecture: ["php-toolkit.json"],
};
const LAYOUT_MARKERS = [
    "public/index.php",
    "bin/console",
    "config",
    "migrations",
    "templates",
    "views",
    "src",
    "tests",
    "test",
    "spec",
    "CHANGELOG.md",
    "CHANGELOG",
    "UPGRADING.md",
    "UPGRADING",
];
const RELEASE_FILES = ["CHANGELOG.md", "CHANGELOG", "UPGRADING.md", "UPGRADING"];
async function exists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
async function firstExisting(root, names) {
    for (const name of names) {
        if (await exists(join(root, name)))
            return name;
    }
    return null;
}
async function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
function frameworkRuntime(require) {
    const hints = [];
    if (Object.keys(require).some((key) => key === "laravel/framework" || key.startsWith("laravel/"))) {
        hints.push("laravel");
    }
    if (Object.keys(require).some((key) => key.startsWith("symfony/"))) {
        hints.push("symfony");
    }
    if (Object.keys(require).some((key) => key.includes("wordpress"))) {
        hints.push("wordpress");
    }
    return { hints: hints.length ? hints : ["none"], runtime: hints.length > 0 };
}
async function packageShape(root) {
    const hasSource = await exists(join(root, "src"));
    if (!hasSource)
        return false;
    const testRoots = await Promise.all(["tests", "test", "spec"].map(async (name) => ((await exists(join(root, name))) ? name : null)));
    if (!testRoots.some((name) => name !== null))
        return false;
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    }
    catch {
        return false;
    }
    const allowed = new Set(["src", "tests", "test", "spec", "bin", "vendor", "node_modules"]);
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (entry.name.startsWith("."))
            continue;
        if (!allowed.has(entry.name))
            return false;
    }
    return true;
}
async function releaseMetadata(root) {
    if (await firstExisting(root, RELEASE_FILES))
        return true;
    try {
        const entries = await readdir(root, { withFileTypes: true });
        return entries.some((entry) => entry.isFile() &&
            (entry.name.startsWith("CHANGELOG") || entry.name.startsWith("UPGRADING")));
    }
    catch {
        return false;
    }
}
async function computeFingerprint(root) {
    const configFiles = await probeConfigFiles(root);
    const parts = [PACKAGE_VERSION];
    const composerPath = join(root, "composer.json");
    try {
        parts.push(`composer.json\0${await readFile(composerPath, "utf8")}`);
    }
    catch {
        // Missing or unreadable composer.json is already reflected in the profile.
    }
    const files = Object.values(configFiles)
        .filter((name) => typeof name === "string")
        .sort();
    for (const name of files) {
        try {
            parts.push(`${name}\0${await readFile(join(root, name), "utf8")}`);
        }
        catch {
            // A config that vanished between probing and hashing simply drops out.
        }
    }
    return sha256(parts.join("\0"));
}
async function probeConfigFiles(root) {
    const entries = await Promise.all(Object.keys(CONFIG_PROBES).map(async (key) => {
        return [key, await firstExisting(root, CONFIG_PROBES[key])];
    }));
    return Object.fromEntries(entries);
}
async function readComposerIdentity(root) {
    try {
        const raw = await readFile(join(root, "composer.json"), "utf8");
        const composer = JSON.parse(raw);
        return {
            packageName: typeof composer.name === "string" ? composer.name : null,
            packageType: typeof composer.type === "string" ? composer.type : null,
        };
    }
    catch {
        return { packageName: null, packageType: null };
    }
}
async function computeLockFingerprint(root) {
    try {
        return sha256(await readFile(join(root, "composer.lock"), "utf8"));
    }
    catch {
        return null;
    }
}
async function computeLayoutMarkerSignature(root) {
    const parts = [];
    for (const marker of LAYOUT_MARKERS) {
        try {
            const info = await stat(join(root, marker));
            parts.push(`${marker}:${info.isDirectory() ? "d" : "f"}:${info.size}:${info.mtimeMs}`);
        }
        catch {
            parts.push(`${marker}:missing`);
        }
    }
    return parts.join("|");
}
export async function buildProjectProfile(root, subpath) {
    const info = await detectPhpProject(root);
    const configFiles = await probeConfigFiles(root);
    const identity = await readComposerIdentity(root);
    const [hasPublicIndex, hasConsoleBin, hasConfigDir, hasMigrations, templates, views, release] = await Promise.all([
        exists(join(root, "public/index.php")),
        exists(join(root, "bin/console")),
        exists(join(root, "config")),
        exists(join(root, "migrations")),
        exists(join(root, "templates")),
        exists(join(root, "views")),
        releaseMetadata(root),
    ]);
    const hasTemplates = templates || views;
    const testRoots = (await Promise.all(["tests", "test", "spec"].map(async (name) => ((await exists(join(root, name))) ? name : null)))).filter((name) => name !== null);
    const shape = await packageShape(root);
    const frameworks = frameworkRuntime(info.require);
    const frameworkRuntimePresent = frameworks.runtime;
    const psr4 = info.autoloadPsr4;
    let applicationScore = 0;
    let libraryScore = 0;
    const evidence = [];
    if (identity.packageType === "project") {
        applicationScore += 3;
        evidence.push("composer:type=project");
    }
    else if (identity.packageType === "library") {
        libraryScore += 2;
        evidence.push("composer:type=library");
    }
    if (hasPublicIndex) {
        applicationScore += 2;
        evidence.push("layout:public-index");
    }
    if (hasConsoleBin) {
        applicationScore += 2;
        evidence.push("layout:console-bin");
    }
    if (hasConfigDir) {
        applicationScore += 1;
        evidence.push("layout:config-dir");
    }
    if (hasMigrations) {
        applicationScore += 1;
        evidence.push("layout:migrations");
    }
    if (hasTemplates) {
        applicationScore += 1;
        evidence.push("layout:templates");
    }
    if (frameworkRuntimePresent) {
        applicationScore += 1;
        evidence.push("composer:framework-runtime");
    }
    if (!hasPublicIndex && !hasConsoleBin) {
        libraryScore += 1;
        evidence.push("layout:no-entry-point");
    }
    if (shape) {
        libraryScore += 1;
        evidence.push("layout:package-shape");
    }
    if (Object.keys(psr4).length > 0 && !frameworkRuntimePresent) {
        libraryScore += 1;
        evidence.push("composer:no-framework-runtime");
    }
    if (release) {
        libraryScore += 1;
        evidence.push("layout:release-metadata");
    }
    let type = "unknown";
    let typeConfidence = "low";
    if (applicationScore >= 3 && applicationScore - libraryScore >= 2) {
        type = "application";
        const margin = applicationScore - libraryScore;
        typeConfidence = margin >= 4 ? "high" : "medium";
    }
    else if (libraryScore >= 3 && libraryScore - applicationScore >= 2) {
        type = "library";
        const margin = libraryScore - applicationScore;
        typeConfidence = margin >= 4 ? "high" : "medium";
    }
    return {
        root,
        subpath,
        type,
        typeConfidence,
        typeEvidence: evidence,
        phpRequirement: info.phpRequirement,
        hasComposerJson: info.hasComposerJson,
        hasComposerLock: info.hasComposerLock,
        autoloadPsr4: psr4,
        packageName: identity.packageName,
        packageType: identity.packageType,
        frameworkHints: frameworks.hints,
        tools: {
            phpunit: info.detectedTools.phpunit,
            psalm: info.detectedTools.psalm,
            pest: info.detectedTools.pest,
            phpstan: info.detectedTools.phpstan,
            phpcs: info.detectedTools.phpcs,
            csFixer: info.detectedTools.csFixer,
            rector: info.detectedTools.rector,
            deptrac: info.detectedTools.deptrac,
            infection: info.detectedTools.infection,
        },
        configFiles,
        layout: {
            sourceRoots: [...new Set(Object.values(psr4))],
            testRoots,
            hasPublicIndex,
            hasConsoleBin,
            hasMigrations,
            hasConfigDir,
            hasTemplates,
        },
        fingerprint: await computeFingerprint(root),
        lockFingerprint: await computeLockFingerprint(root),
    };
}
function cacheKey(root, subpath) {
    return `${root}\0${subpath ?? ""}`;
}
export class ProjectProfileCache {
    #items = new Map();
    #layoutMarkerSignatures = new Map();
    get size() {
        return this.#items.size;
    }
    async resolve(root, subpath) {
        const key = cacheKey(root, subpath);
        const cached = this.#items.get(key);
        const [freshFingerprint, lockFingerprint, markerSignature] = await Promise.all([
            computeFingerprint(root),
            computeLockFingerprint(root),
            computeLayoutMarkerSignature(root),
        ]);
        if (cached &&
            cached.fingerprint === freshFingerprint &&
            cached.lockFingerprint === lockFingerprint &&
            this.#layoutMarkerSignatures.get(key) === markerSignature) {
            return cached;
        }
        const next = await buildProjectProfile(root, subpath);
        this.#layoutMarkerSignatures.set(key, markerSignature);
        this.#items.set(key, next);
        return next;
    }
    clear() {
        this.#items.clear();
        this.#layoutMarkerSignatures.clear();
    }
}
//# sourceMappingURL=profile.js.map
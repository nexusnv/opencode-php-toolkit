import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { MAX_SCOPE_FILES, toPosix } from "./changed.js";
import { REASONS } from "./types.js";
/** Bounded scan for `*Test.php` files under the test roots. */
export const MAX_TEST_SEARCH_ENTRIES = 2_000;
/** Above this, a targeted run costs more than it saves; use the full suite. */
export const MAX_TARGETED_TESTS = 200;
const CONVENTION_DIRS = ["Unit", "Feature", "Integration"];
const SKIPPED_DIRS = new Set(["vendor", "node_modules"]);
function underAny(file, roots) {
    return roots.some((root) => file === root || file.startsWith(`${root}/`));
}
function relativeTo(file, roots) {
    for (const root of roots) {
        if (file.startsWith(`${root}/`))
            return file.slice(root.length + 1);
    }
    return null;
}
async function existingDir(root, name) {
    try {
        return (await stat(join(root, name))).isDirectory();
    }
    catch {
        return false;
    }
}
async function findRoots(root, configured, conventional) {
    const roots = [...new Set(configured.map((dir) => toPosix(dir).replace(/\/$/, "")).filter(Boolean))];
    if (roots.length > 0)
        return roots;
    const present = await Promise.all(conventional.map(async (name) => ((await existingDir(root, name)) ? name : null)));
    return present.filter((name) => name !== null);
}
async function isFile(root, rel) {
    try {
        return (await stat(join(root, rel))).isFile();
    }
    catch {
        return false;
    }
}
/** Indexes `*Test.php` basenames under the test roots with a bounded walk. */
async function indexTestFiles(root, testRoots) {
    const byName = new Map();
    let seen = 0;
    let truncated = false;
    for (const testRoot of testRoots) {
        const stack = [testRoot];
        while (stack.length > 0) {
            const current = stack.pop();
            let entries;
            try {
                entries = await readdir(join(root, current), { withFileTypes: true });
            }
            catch {
                continue;
            }
            entries.sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                if (entry.name.startsWith(".") || entry.isSymbolicLink())
                    continue;
                seen += 1;
                if (seen > MAX_TEST_SEARCH_ENTRIES) {
                    return { byName, truncated: true };
                }
                const rel = `${current}/${entry.name}`;
                if (entry.isDirectory()) {
                    if (!SKIPPED_DIRS.has(entry.name))
                        stack.push(rel);
                    continue;
                }
                if (!entry.isFile() || !entry.name.endsWith("Test.php"))
                    continue;
                const list = byName.get(entry.name) ?? [];
                list.push(rel);
                byName.set(entry.name, list);
            }
        }
    }
    for (const list of byName.values())
        list.sort((a, b) => a.localeCompare(b));
    return { byName, truncated: false };
}
export async function selectTests(input) {
    const testRoots = await findRoots(input.root, input.profile.layout.testRoots, ["tests", "test", "spec"]);
    const sourceRoots = await findRoots(input.root, input.profile.layout.sourceRoots, ["src"]);
    const phpChanged = input.changed.files.filter((file) => file.endsWith(".php"));
    const direct = phpChanged.filter((file) => underAny(file, testRoots));
    const sourceChanged = phpChanged.filter((file) => !underAny(file, testRoots) && underAny(file, sourceRoots));
    const deletedSources = input.changed.deleted.filter((file) => file.endsWith(".php") && !underAny(file, testRoots) && underAny(file, sourceRoots));
    const directOnly = () => ({
        mode: direct.length > 0 ? "targeted" : "none",
        paths: direct,
        direct: direct.length,
        mapped: 0,
        fallbackReason: null,
    });
    const fallback = (mapped) => ({
        mode: "full-suite",
        paths: [],
        direct: direct.length,
        mapped,
        fallbackReason: REASONS.fullSuiteFallback,
    });
    if (deletedSources.length > 0)
        return fallback(0);
    // A non-test PHP change outside the known source roots cannot be mapped or
    // ruled out; run the full suite rather than silently skipping tests.
    const unclassified = phpChanged.filter((file) => !underAny(file, testRoots) && !underAny(file, sourceRoots));
    if (unclassified.length > 0)
        return fallback(0);
    if (sourceChanged.length === 0)
        return directOnly();
    const mapped = new Set();
    const missing = [];
    for (const source of sourceChanged) {
        const rel = relativeTo(source, sourceRoots);
        if (!rel) {
            missing.push(source);
            continue;
        }
        const testName = rel.replace(/\.php$/, "Test.php");
        const candidates = [
            ...testRoots.map((testRoot) => `${testRoot}/${testName}`),
            ...CONVENTION_DIRS.flatMap((dir) => testRoots.map((testRoot) => `${testRoot}/${dir}/${testName}`)),
        ];
        let found = false;
        for (const candidate of candidates) {
            if (await isFile(input.root, candidate)) {
                mapped.add(candidate);
                found = true;
            }
        }
        if (!found)
            missing.push(source);
    }
    if (missing.length > 0) {
        const index = await indexTestFiles(input.root, testRoots);
        if (index.truncated)
            return fallback(mapped.size);
        for (const source of missing) {
            const name = `${basename(source).replace(/\.php$/, "")}Test.php`;
            const candidates = index.byName.get(name) ?? [];
            if (candidates.length === 0)
                return fallback(mapped.size);
            for (const candidate of candidates)
                mapped.add(candidate);
        }
    }
    for (const file of direct)
        mapped.add(file);
    if (mapped.size > MAX_TARGETED_TESTS || mapped.size > MAX_SCOPE_FILES) {
        return fallback(mapped.size);
    }
    const paths = [...mapped].sort((a, b) => a.localeCompare(b));
    return {
        mode: "targeted",
        paths,
        direct: direct.length,
        mapped: paths.length - direct.length,
        fallbackReason: null,
    };
}
//# sourceMappingURL=test-selection.js.map
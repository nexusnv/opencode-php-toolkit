import { fileURLToPath } from "node:url";
import { execFileRunner, isMissingBinary, PERMISSION_APPROVAL_CODE, PERMISSION_DENIED_CODE } from "../tools/runner.js";
import { createArchitectureCacheKey, readArchitectureCache, writeArchitectureCache, } from "./cache.js";
const OUTPUT_LIMIT = 1024 * 1024;
const TIMEOUT_MS = 20_000;
const SCRIPT_PATH = fileURLToPath(new URL("../../scripts/architecture-scan.php", import.meta.url));
function failure(status, message, permissionFailure) {
    return {
        status,
        cacheHit: false,
        cacheMode: null,
        filesScanned: 0,
        truncated: false,
        results: [],
        diagnostics: [],
        error: message,
        ...(permissionFailure ? { permissionFailure } : {}),
    };
}
function parsePayload(raw) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!value || typeof value !== "object")
        return null;
    const payload = value;
    if (!(payload.status === "ok" || payload.status === "error") || !Array.isArray(payload.results) || !Array.isArray(payload.diagnostics) ||
        typeof payload.filesScanned !== "number" || typeof payload.truncated !== "boolean")
        return null;
    const results = [];
    for (const item of payload.results) {
        if (!item || typeof item !== "object")
            return null;
        const row = item;
        if (!["finding", "hypothesis", "metric"].includes(row.kind) ||
            !(typeof row.file === "string" || row.file === null) || typeof row.message !== "string")
            return null;
        results.push({
            kind: row.kind,
            file: row.file,
            message: row.message,
            ...(typeof row.severity === "string" ? { severity: row.severity } : {}),
            ...(typeof row.line === "number" || row.line === null ? { line: row.line } : {}),
            ...(typeof row.evidence === "string" ? { evidence: row.evidence.slice(0, 1000) } : {}),
            ...(Array.isArray(row.candidatePatterns) && row.candidatePatterns.every((pattern) => typeof pattern === "string")
                ? { candidatePatterns: row.candidatePatterns.slice(0, 10) } : {}),
            ...(typeof row.confidence === "string" ? { confidence: row.confidence } : {}),
        });
    }
    if (!payload.diagnostics.every((item) => typeof item === "string"))
        return null;
    if (payload.fingerprints !== undefined && (!payload.fingerprints || typeof payload.fingerprints !== "object" ||
        Array.isArray(payload.fingerprints) || !Object.values(payload.fingerprints).every((item) => typeof item === "string")))
        return null;
    return {
        status: payload.status,
        filesScanned: Math.max(0, Math.floor(payload.filesScanned)),
        truncated: payload.truncated,
        diagnostics: payload.diagnostics.map((item) => item.slice(0, 1000)).slice(0, 100),
        results: results.slice(0, 10_000),
        ...(payload.fingerprints ? { fingerprints: payload.fingerprints } : {}),
        ...(payload.status === "error"
            ? { error: (payload.diagnostics.join("\n") || "PHP architecture scan was incomplete.").slice(0, 2000) }
            : {}),
    };
}
/** Runs the packaged token scanner through the caller's permission-aware runner. */
export async function scanArchitecture(root, profile, options = {}) {
    const runner = options.runner ?? execFileRunner;
    if (options.signal?.aborted)
        return failure("cancelled", "Architecture scan was cancelled before it started.");
    const timeoutMs = Math.max(1, Math.min(TIMEOUT_MS, Math.floor(options.timeoutMs ?? TIMEOUT_MS)));
    const deadlineAt = Date.now() + timeoutMs;
    const identity = await createArchitectureCacheKey(root, profile, options.maxFiles, deadlineAt);
    if (identity.timedOut || Date.now() >= deadlineAt) {
        return failure("timed-out", `Architecture scan exceeded its ${Math.ceil(timeoutMs / 1000)} second total limit while preparing its cache key.`);
    }
    if (!options.refresh && !identity.truncated) {
        const cached = await readArchitectureCache(identity.key, options.storage);
        if (cached)
            return { ...cached, cacheHit: true, cacheMode: identity.mode };
    }
    const args = [SCRIPT_PATH, "--directory", root, "--format", "json"];
    if (options.maxFiles !== undefined)
        args.push("--max-files", String(Math.max(1, Math.min(500, Math.floor(options.maxFiles)))));
    const remainingMs = Math.floor(deadlineAt - Date.now());
    if (remainingMs <= 0)
        return failure("timed-out", `Architecture scan exceeded its ${Math.ceil(timeoutMs / 1000)} second total limit before PHP started.`);
    const run = await runner.run("php", args, root, remainingMs, options.signal);
    if (run.aborted || options.signal?.aborted)
        return failure("cancelled", "Architecture scan was cancelled.");
    if (run.killed)
        return failure("timed-out", `Architecture scanner exceeded its ${Math.ceil(timeoutMs / 1000)} second limit.`);
    if (run.code === PERMISSION_DENIED_CODE || run.code === PERMISSION_APPROVAL_CODE) {
        return failure("unavailable", run.stderr || "PHP execution was blocked by command permissions.", run.code === PERMISSION_DENIED_CODE ? "denied" : "approval-required");
    }
    if (isMissingBinary(run))
        return failure("unavailable", "PHP CLI was not found on PATH.");
    if (!run.ok)
        return failure("error", (run.stderr || "PHP architecture scanner failed.").slice(0, 2000));
    if (Buffer.byteLength(run.stdout, "utf8") > OUTPUT_LIMIT)
        return failure("error", "Architecture scanner output exceeded the 1 MiB limit.");
    const payload = parsePayload(run.stdout);
    if (!payload)
        return failure("error", "PHP architecture scanner returned invalid JSON or an unsupported result shape.");
    const { fingerprints, ...scanPayload } = payload;
    const result = { ...scanPayload, cacheHit: false, cacheMode: identity.mode };
    if (payload.status !== "ok")
        return result;
    const expectedPaths = Object.keys(identity.fingerprints).sort();
    const actualPaths = Object.keys(fingerprints ?? {}).sort();
    const fingerprintsMatch = fingerprints !== undefined &&
        payload.filesScanned === expectedPaths.length &&
        expectedPaths.length === actualPaths.length &&
        expectedPaths.every((path, index) => path === actualPaths[index] && identity.fingerprints[path] === fingerprints[path]);
    if (!identity.truncated && fingerprintsMatch) {
        await writeArchitectureCache(identity.key, scanPayload, options.storage);
    }
    return result;
}
//# sourceMappingURL=scanner.js.map
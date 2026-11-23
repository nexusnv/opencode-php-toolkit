import { fileURLToPath } from "node:url";
import type { ProjectProfile } from "../profile.js";
import { execFileRunner, isMissingBinary, PERMISSION_APPROVAL_CODE, PERMISSION_DENIED_CODE, type CommandRunner } from "../tools/runner.js";
import {
  createArchitectureCacheKey,
  readArchitectureCache,
  writeArchitectureCache,
  type ArchitectureCacheMode,
  type ArchitectureCacheStorage,
} from "./cache.js";

export type ArchitectureResultKind = "finding" | "hypothesis" | "metric";
export interface ArchitectureScanItem {
  kind: ArchitectureResultKind;
  severity?: string;
  file: string | null;
  line?: number | null;
  message: string;
  evidence?: string;
  candidatePatterns?: string[];
  confidence?: string;
}

export interface ArchitectureScanResult {
  status: "ok" | "unavailable" | "timed-out" | "cancelled" | "error";
  cacheHit: boolean;
  cacheMode: ArchitectureCacheMode | null;
  filesScanned: number;
  truncated: boolean;
  results: ArchitectureScanItem[];
  diagnostics: string[];
  error?: string;
}

export interface ArchitectureScanOptions {
  runner?: CommandRunner;
  storage?: ArchitectureCacheStorage;
  signal?: AbortSignal;
  maxFiles?: number;
  refresh?: boolean;
  timeoutMs?: number;
}

const OUTPUT_LIMIT = 1024 * 1024;
const TIMEOUT_MS = 20_000;
const SCRIPT_PATH = fileURLToPath(new URL("../../scripts/architecture-scan.php", import.meta.url));

function failure(status: ArchitectureScanResult["status"], message: string): ArchitectureScanResult {
  return { status, cacheHit: false, cacheMode: null, filesScanned: 0, truncated: false, results: [], diagnostics: [], error: message };
}

function parsePayload(raw: string): Omit<ArchitectureScanResult, "cacheHit" | "cacheMode"> | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (payload.status !== "ok" || !Array.isArray(payload.results) || !Array.isArray(payload.diagnostics) ||
      typeof payload.filesScanned !== "number" || typeof payload.truncated !== "boolean") return null;
  const results: ArchitectureScanItem[] = [];
  for (const item of payload.results) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (!(["finding", "hypothesis", "metric"] as unknown[]).includes(row.kind) ||
        !(typeof row.file === "string" || row.file === null) || typeof row.message !== "string") return null;
    results.push({
      kind: row.kind as ArchitectureResultKind,
      file: row.file as string | null,
      message: row.message,
      ...(typeof row.severity === "string" ? { severity: row.severity } : {}),
      ...(typeof row.line === "number" || row.line === null ? { line: row.line as number | null } : {}),
      ...(typeof row.evidence === "string" ? { evidence: row.evidence.slice(0, 1000) } : {}),
      ...(Array.isArray(row.candidatePatterns) && row.candidatePatterns.every((pattern) => typeof pattern === "string")
        ? { candidatePatterns: (row.candidatePatterns as string[]).slice(0, 10) } : {}),
      ...(typeof row.confidence === "string" ? { confidence: row.confidence } : {}),
    });
  }
  if (!payload.diagnostics.every((item) => typeof item === "string")) return null;
  return {
    status: "ok",
    filesScanned: Math.max(0, Math.floor(payload.filesScanned)),
    truncated: payload.truncated,
    diagnostics: (payload.diagnostics as string[]).map((item) => item.slice(0, 1000)).slice(0, 100),
    results: results.slice(0, 10_000),
  };
}

/** Runs the packaged token scanner through the caller's permission-aware runner. */
export async function scanArchitecture(
  root: string,
  profile: ProjectProfile,
  options: ArchitectureScanOptions = {},
): Promise<ArchitectureScanResult> {
  const runner = options.runner ?? execFileRunner;
  if (options.signal?.aborted) return failure("cancelled", "Architecture scan was cancelled before it started.");
  const timeoutMs = Math.max(1, Math.min(TIMEOUT_MS, Math.floor(options.timeoutMs ?? TIMEOUT_MS)));
  const deadlineAt = Date.now() + timeoutMs;
  const identity = await createArchitectureCacheKey(root, profile, options.maxFiles, deadlineAt);
  if (identity.timedOut || Date.now() >= deadlineAt) {
    return failure("timed-out", `Architecture scan exceeded its ${Math.ceil(timeoutMs / 1000)} second total limit while preparing its cache key.`);
  }
  if (!options.refresh && !identity.truncated) {
    const cached = await readArchitectureCache<Omit<ArchitectureScanResult, "cacheHit" | "cacheMode">>(identity.key, options.storage);
    if (cached) return { ...cached, cacheHit: true, cacheMode: identity.mode };
  }
  const args = [SCRIPT_PATH, "--directory", root, "--format", "json"];
  if (options.maxFiles !== undefined) args.push("--max-files", String(Math.max(1, Math.min(500, Math.floor(options.maxFiles)))));
  const remainingMs = Math.floor(deadlineAt - Date.now());
  if (remainingMs <= 0) return failure("timed-out", `Architecture scan exceeded its ${Math.ceil(timeoutMs / 1000)} second total limit before PHP started.`);
  const run = await runner.run("php", args, root, remainingMs, options.signal);
  if (run.aborted || options.signal?.aborted) return failure("cancelled", "Architecture scan was cancelled.");
  if (run.killed) return failure("timed-out", `Architecture scanner exceeded its ${Math.ceil(timeoutMs / 1000)} second limit.`);
  if (run.code === PERMISSION_DENIED_CODE || run.code === PERMISSION_APPROVAL_CODE) {
    return failure("unavailable", run.stderr || "PHP execution was blocked by command permissions.");
  }
  if (isMissingBinary(run)) return failure("unavailable", "PHP CLI was not found on PATH.");
  if (!run.ok) return failure("error", (run.stderr || "PHP architecture scanner failed.").slice(0, 2000));
  if (Buffer.byteLength(run.stdout, "utf8") > OUTPUT_LIMIT) return failure("error", "Architecture scanner output exceeded the 1 MiB limit.");
  const payload = parsePayload(run.stdout);
  if (!payload) return failure("error", "PHP architecture scanner returned invalid JSON or an unsupported result shape.");
  const result: ArchitectureScanResult = { ...payload, cacheHit: false, cacheMode: identity.mode };
  if (!identity.truncated) await writeArchitectureCache(identity.key, payload, options.storage);
  return result;
}

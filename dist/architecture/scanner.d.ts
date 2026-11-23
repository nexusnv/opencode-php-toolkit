import type { ProjectProfile } from "../profile.js";
import { type CommandRunner } from "../tools/runner.js";
import { type ArchitectureCacheMode, type ArchitectureCacheStorage } from "./cache.js";
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
/** Runs the packaged token scanner through the caller's permission-aware runner. */
export declare function scanArchitecture(root: string, profile: ProjectProfile, options?: ArchitectureScanOptions): Promise<ArchitectureScanResult>;

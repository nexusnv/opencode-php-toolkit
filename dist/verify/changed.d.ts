import type { ProjectProfile } from "../profile.js";
/** Upper bound for a single verification file set (output and runtime). */
export declare const MAX_SCOPE_FILES = 500;
export interface VcsFileStatusLike {
    file: string;
    status: "added" | "deleted" | "modified";
}
export interface ChangedScope {
    source: "vcs" | "paths" | "unavailable";
    /** Root-relative POSIX paths to check (added + modified, or the path override). */
    files: string[];
    /** Root-relative POSIX paths that were deleted; never passed to a checker. */
    deleted: string[];
    note: string | null;
}
export interface PhpFileList {
    files: string[];
    truncated: boolean;
}
export declare function toPosix(path: string): string;
export declare function isInside(parent: string, candidate: string): boolean;
export declare function resolveVerificationRoot(sessionRoot: string, requested?: string): {
    root: string;
} | {
    error: string;
};
export declare function normalizeVcsStatus(root: string, data: readonly VcsFileStatusLike[]): ChangedScope;
export declare function pathsOverride(root: string, paths: readonly string[]): {
    files: string[];
    ignored: number;
} | {
    error: string;
};
export declare function listProjectPhpFiles(root: string, profile: ProjectProfile, cap?: number): Promise<PhpFileList>;

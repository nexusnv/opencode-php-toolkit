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
    /** True when the host reported more paths than MAX_SCOPE_FILES. */
    truncated: boolean;
    note: string | null;
}
export interface PhpFileList {
    files: string[];
    truncated: boolean;
    /** Configured roots that resolved outside the verification root and were ignored. */
    outsideRoots: number;
}
export declare function toPosix(path: string): string;
export declare function isInside(parent: string, candidate: string): boolean;
/**
 * Canonicalizes the verification root and rejects a directory whose real
 * target (through a symlink) leaves the session root. The lexical check in
 * `resolveVerificationRoot` cannot see that redirect.
 */
export declare function canonicalVerificationRoot(sessionRoot: string, root: string): Promise<{
    root: string;
} | {
    error: string;
}>;
/**
 * Normalizes a configured source/test root to the same root-relative POSIX
 * form as VCS paths. Composer can emit `./src/`; that must still match
 * `src/A.php`.
 */
export declare function normalizeConfiguredRoot(dir: string): string;
/**
 * Normalizes configured source/test roots and keeps only those that resolve
 * inside the verification root. A root that points outside - lexically or
 * through a symlink - must never be walked, or lint/test discovery would
 * report findings from another project.
 */
export declare function containedConfiguredRoots(root: string, dirs: readonly string[]): Promise<{
    roots: string[];
    outside: number;
}>;
/**
 * Finds the Git worktree root above a directory. VCS status paths are
 * worktree-relative, so a verification root below the worktree root must
 * rebase them before matching.
 */
export declare function findWorktreeRoot(start: string): Promise<string>;
export declare function resolveVerificationRoot(sessionRoot: string, requested?: string): {
    root: string;
} | {
    error: string;
};
export declare function normalizeVcsStatus(root: string, data: readonly VcsFileStatusLike[], worktreeRoot?: string): ChangedScope;
export declare function pathsOverride(root: string, paths: readonly string[], canonicalRoot?: string): Promise<{
    files: string[];
    ignored: number;
} | {
    error: string;
}>;
export declare function listProjectPhpFiles(root: string, profile: ProjectProfile, cap?: number): Promise<PhpFileList>;

import { readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ProjectProfile } from "../profile.js";

/** Upper bound for a single verification file set (output and runtime). */
export const MAX_SCOPE_FILES = 500;

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

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function isInside(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

/**
 * Canonicalizes the verification root and rejects a directory whose real
 * target (through a symlink) leaves the session root. The lexical check in
 * `resolveVerificationRoot` cannot see that redirect.
 */
export async function canonicalVerificationRoot(
  sessionRoot: string,
  root: string,
): Promise<{ root: string } | { error: string }> {
  const session = (await realpathOrNull(sessionRoot)) ?? resolve(sessionRoot);
  const canonical = await realpathOrNull(root);
  if (!canonical) {
    return { error: `directory does not exist: ${root}` };
  }
  if (!isInside(session, canonical)) {
    return { error: `directory must stay inside the session root: ${root}` };
  }
  return { root: canonical };
}

/**
 * Normalizes a configured source/test root to the same root-relative POSIX
 * form as VCS paths. Composer can emit `./src/`; that must still match
 * `src/A.php`.
 */
export function normalizeConfiguredRoot(dir: string): string {
  const posix = toPosix(dir).replace(/^\.\/+/, "").replace(/\/+$/, "");
  return posix === "." ? "" : posix;
}

/**
 * Normalizes configured source/test roots and keeps only those that resolve
 * inside the verification root. A root that points outside - lexically or
 * through a symlink - must never be walked, or lint/test discovery would
 * report findings from another project.
 */
export async function containedConfiguredRoots(
  root: string,
  dirs: readonly string[],
): Promise<{ roots: string[]; outside: number }> {
  const roots: string[] = [];
  let outside = 0;
  const canonicalRoot = (await realpathOrNull(root)) ?? resolve(root);
  const unique = [...new Set(dirs.map(normalizeConfiguredRoot).filter(Boolean))];
  for (const dir of unique) {
    const abs = resolve(root, dir);
    if (!isInside(root, abs)) {
      outside += 1;
      continue;
    }
    const canonical = await realpathOrNull(abs);
    if (canonical && !isInside(canonicalRoot, canonical)) {
      outside += 1;
      continue;
    }
    roots.push(toPosix(relative(root, abs)));
  }
  return { roots, outside };
}

/**
 * Finds the Git worktree root above a directory. VCS status paths are
 * worktree-relative, so a verification root below the worktree root must
 * rebase them before matching.
 */
export async function findWorktreeRoot(start: string): Promise<string> {
  const origin = resolve(start);
  let dir = origin;
  for (;;) {
    try {
      await stat(join(dir, ".git"));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return origin;
      dir = parent;
    }
  }
}

export function resolveVerificationRoot(
  sessionRoot: string,
  requested?: string,
): { root: string } | { error: string } {
  const root = resolve(sessionRoot, requested && requested.length > 0 ? requested : ".");
  if (!isInside(sessionRoot, root)) {
    return { error: `directory must stay inside the session root: ${requested ?? "."}` };
  }
  return { root };
}

function rootRelative(root: string, file: string): string | null {
  const normalized = file.split("\\").join("/");
  const abs = isAbsolute(normalized) ? normalized : resolve(root, normalized);
  if (!isInside(root, abs)) return null;
  const rel = toPosix(relative(root, abs));
  return rel === "" ? null : rel;
}

export function normalizeVcsStatus(
  root: string,
  data: readonly VcsFileStatusLike[],
  worktreeRoot: string = root,
): ChangedScope {
  const files = new Set<string>();
  const deleted = new Set<string>();
  let outside = 0;
  for (const entry of data) {
    const normalized = entry.file.split("\\").join("/");
    let rel: string | null;
    if (isAbsolute(normalized)) {
      rel = rootRelative(root, normalized);
    } else {
      // Git reports worktree-relative paths. A host that returns paths
      // relative to the requested directory is still accepted by falling
      // back to the verification root when the worktree form lands outside.
      rel = rootRelative(root, resolve(worktreeRoot, normalized));
      if (!rel && worktreeRoot !== root) {
        rel = rootRelative(root, resolve(root, normalized));
      }
    }
    if (!rel) {
      outside += 1;
      continue;
    }
    if (entry.status === "deleted") deleted.add(rel);
    else files.add(rel);
  }
  const all = [...files];
  const allDeleted = [...deleted];
  const capped = all.slice(0, MAX_SCOPE_FILES);
  const cappedDeleted = allDeleted.slice(0, MAX_SCOPE_FILES);
  const truncated = all.length > capped.length || allDeleted.length > cappedDeleted.length;
  const notes: string[] = [];
  if (outside > 0) notes.push(`${outside} changed file(s) outside the verification root were ignored`);
  if (truncated) notes.push(`file list truncated to ${MAX_SCOPE_FILES}`);
  return {
    source: "vcs",
    files: capped,
    deleted: cappedDeleted,
    truncated,
    note: notes.length ? notes.join("; ") : null,
  };
}

export async function pathsOverride(
  root: string,
  paths: readonly string[],
  canonicalRoot: string = root,
): Promise<{ files: string[]; ignored: number } | { error: string }> {
  const files = new Set<string>();
  let ignored = 0;
  for (const raw of paths) {
    const abs = resolve(root, raw);
    if (!isInside(root, abs)) return { error: `path escapes the verification root: ${raw}` };
    const canonical = await realpathOrNull(abs);
    if (canonical && !isInside(canonicalRoot, canonical)) {
      return { error: `path escapes the verification root through a symlink: ${raw}` };
    }
    const rel = toPosix(relative(root, abs));
    if (!rel.endsWith(".php")) {
      ignored += 1;
      continue;
    }
    files.add(rel);
  }
  if (files.size > MAX_SCOPE_FILES) {
    return { error: `paths exceed the ${MAX_SCOPE_FILES} file limit` };
  }
  return { files: [...files], ignored };
}

const SKIPPED_DIRS = new Set(["vendor", "node_modules"]);

async function walkPhpFiles(
  root: string,
  dirs: readonly string[],
  cap: number,
): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let truncated = false;
  for (const dir of dirs) {
    if (files.length >= cap) {
      truncated = true;
      break;
    }
    const stack = [dir];
    while (stack.length > 0 && files.length < cap) {
      const current = stack.pop()!;
      let entries;
      try {
        entries = await readdir(join(root, current), { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isSymbolicLink()) continue;
        const rel = current ? `${current}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (!SKIPPED_DIRS.has(entry.name)) stack.push(rel);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".php")) continue;
        if (files.length >= cap) {
          truncated = true;
          break;
        }
        files.push(rel);
      }
    }
    if (stack.length > 0) truncated = true;
  }
  files.sort((a, b) => a.localeCompare(b));
  return { files: files.slice(0, cap), truncated };
}

async function existingDir(root: string, name: string): Promise<boolean> {
  try {
    return (await stat(join(root, name))).isDirectory();
  } catch {
    return false;
  }
}

export async function listProjectPhpFiles(
  root: string,
  profile: ProjectProfile,
  cap: number = MAX_SCOPE_FILES,
): Promise<PhpFileList> {
  const configured = [...profile.layout.sourceRoots, ...profile.layout.testRoots].filter(
    (dir) => normalizeConfiguredRoot(dir) !== "",
  );
  let candidates: string[];
  let outsideRoots = 0;
  if (configured.length > 0) {
    const contained = await containedConfiguredRoots(root, configured);
    candidates = contained.roots;
    outsideRoots = contained.outside;
  } else {
    const conventional = ["src", "tests", "test", "spec"];
    const present = await Promise.all(
      conventional.map(async (name) => ((await existingDir(root, name)) ? name : null)),
    );
    const contained = await containedConfiguredRoots(
      root,
      present.filter((name): name is string => name !== null),
    );
    candidates = contained.roots;
    outsideRoots = contained.outside;
  }
  const list = await walkPhpFiles(root, candidates, cap);
  return { ...list, outsideRoots };
}

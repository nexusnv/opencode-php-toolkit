import { readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
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
  note: string | null;
}

export interface PhpFileList {
  files: string[];
  truncated: boolean;
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function isInside(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
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
): ChangedScope {
  const files = new Set<string>();
  const deleted = new Set<string>();
  let outside = 0;
  for (const entry of data) {
    const rel = rootRelative(root, entry.file);
    if (!rel) {
      outside += 1;
      continue;
    }
    if (entry.status === "deleted") deleted.add(rel);
    else files.add(rel);
  }
  const all = [...files];
  const capped = all.slice(0, MAX_SCOPE_FILES);
  const notes: string[] = [];
  if (outside > 0) notes.push(`${outside} changed file(s) outside the verification root were ignored`);
  if (all.length > capped.length) notes.push(`file list truncated to ${MAX_SCOPE_FILES}`);
  return {
    source: "vcs",
    files: capped,
    deleted: [...deleted].slice(0, MAX_SCOPE_FILES),
    note: notes.length ? notes.join("; ") : null,
  };
}

export function pathsOverride(
  root: string,
  paths: readonly string[],
): { files: string[]; ignored: number } | { error: string } {
  const files = new Set<string>();
  let ignored = 0;
  for (const raw of paths) {
    const abs = resolve(root, raw);
    if (!isInside(root, abs)) return { error: `path escapes the verification root: ${raw}` };
    const rel = toPosix(relative(root, abs));
    if (!rel.endsWith(".php")) {
      ignored += 1;
      continue;
    }
    files.add(rel);
  }
  return { files: [...files].slice(0, MAX_SCOPE_FILES), ignored };
}

const SKIPPED_DIRS = new Set(["vendor", "node_modules"]);

async function walkPhpFiles(
  root: string,
  dirs: readonly string[],
  cap: number,
): Promise<PhpFileList> {
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
        const rel = `${current}/${entry.name}`;
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
  const configured = [...profile.layout.sourceRoots, ...profile.layout.testRoots];
  let dirs = [...new Set(configured.map((dir) => toPosix(dir).replace(/\/$/, "")))].filter(Boolean);
  if (dirs.length === 0) {
    const conventional = ["src", "tests", "test", "spec"];
    const present = await Promise.all(conventional.map(async (name) => ((await existingDir(root, name)) ? name : null)));
    dirs = present.filter((name): name is string => name !== null);
  }
  return walkPhpFiles(root, dirs, cap);
}

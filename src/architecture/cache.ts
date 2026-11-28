import { createHash } from "node:crypto";
import { lstat, opendir, readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ProjectProfile } from "../profile.js";

export type ArchitectureCacheMode = "content" | "metadata";
export interface ArchitectureCacheStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface ArchitectureCacheIdentity {
  key: string;
  mode: ArchitectureCacheMode;
  files: number;
  truncated: boolean;
  timedOut: boolean;
  fingerprints: Record<string, string>;
}

export const ARCHITECTURE_SCANNER_VERSION = "5";
const CACHE_PREFIX = "php-toolkit.architecture-scan.v5.";
const CONTENT_HASH_LIMIT = 1024 * 1024;
const CONTENT_HASH_BUDGET = 16 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 20_000;
const DEFAULT_MAX_FILES = 500;
const memoryCache = new Map<string, unknown>();
let toolkitVersionPromise: Promise<string> | undefined;

function isWithinRoot(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

async function safePath(root: string, path: string, directory: boolean): Promise<string | null> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || (directory ? !metadata.isDirectory() : !metadata.isFile())) return null;
    const canonical = await realpath(path);
    if (!isWithinRoot(root, canonical)) return null;
    return canonical;
  } catch {
    return null;
  }
}

async function toolkitVersion(): Promise<string> {
  if (!toolkitVersionPromise) {
    const path = fileURLToPath(new URL("../../package.json", import.meta.url));
    toolkitVersionPromise = readFile(path, "utf8")
      .then((text) => String((JSON.parse(text) as { version?: unknown }).version ?? "unknown"))
      .catch(() => "unknown");
  }
  return toolkitVersionPromise;
}

function excluded(relativePath: string): boolean {
  return relativePath.split(/[\\/]/).some((part) => ["vendor", "node_modules", ".git", "var", "storage"].includes(part));
}

/** Applies the project's validated architecture excludes before files are counted. */
function projectExcluded(relativePath: string, excludes: readonly string[]): boolean {
  const normalizedPath = relativePath.split(/[\\/]/).join("/");
  return excludes.some((exclude) => {
    const prefix = exclude.trim().replace(/^\.\//, "").replace(/\/+$/, "").split(/[\\/]/).join("/");
    return prefix !== "" && (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
  });
}

async function phpFiles(
  root: string,
  maxFiles: number,
  deadlineAt: number,
  excludes: readonly string[],
): Promise<{ files: string[]; truncated: boolean; timedOut: boolean }> {
  const files: string[] = [];
  const pending = [root];
  let visitedEntries = 0;
  let truncated = false;
  while (pending.length > 0) {
    if (Date.now() >= deadlineAt) return { files: files.sort().slice(0, maxFiles), truncated, timedOut: true };
    const directory = pending.pop()!;
    if (!(await safePath(root, directory, true))) continue;
    let handle;
    try {
      handle = await opendir(directory);
    } catch {
      continue;
    }
    // The queued path may have been replaced after its Dirent was inspected.
    // Validate again after opening and before reading entries; a redirected
    // handle is closed without being traversed.
    if (!(await safePath(root, directory, true))) {
      await handle.close().catch(() => undefined);
      continue;
    }
    const entries = [];
    try {
      for await (const entry of handle) {
        visitedEntries += 1;
        if (visitedEntries > MAX_DIRECTORY_ENTRIES) {
          truncated = true;
          break;
        }
        entries.push(entry);
      }
    } catch {
      // An unreadable directory contributes no files.
    }
    if (Date.now() >= deadlineAt) return { files: files.sort().slice(0, maxFiles), truncated, timedOut: true };
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const childDirectories: string[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      if (excluded(relativePath) || projectExcluded(relativePath, excludes) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) childDirectories.push(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".php")) {
        const canonical = await safePath(root, path, false);
        if (!canonical) continue;
        const canonicalRelative = relative(root, canonical);
        if (excluded(canonicalRelative) || projectExcluded(canonicalRelative, excludes)) continue;
        files.push(canonicalRelative.split(sep).join("/"));
        if (files.length > maxFiles) {
          truncated = true;
          break;
        }
      }
    }
    for (let index = childDirectories.length - 1; index >= 0; index -= 1) pending.push(childDirectories[index]!);
    if (visitedEntries > MAX_DIRECTORY_ENTRIES) break;
  }
  return { files: files.sort().slice(0, maxFiles), truncated, timedOut: false };
}

/** Content fingerprints are exact up to 1 MiB per file and a 16 MiB aggregate budget.
 * Remaining files use metadata mode.
 */
export async function createArchitectureCacheKey(
  root: string,
  profile: ProjectProfile,
  maxFiles = 500,
  deadlineAt = Date.now() + 20_000,
): Promise<ArchitectureCacheIdentity> {
  const absoluteRoot = await realpath(resolve(root));
  const cap = Math.max(1, Math.min(DEFAULT_MAX_FILES, Math.floor(maxFiles)));
  const listing = await phpFiles(absoluteRoot, cap, deadlineAt, profile.toolkitConfig?.config.architecture?.exclude ?? []);
  const files = listing.files;
  if (listing.timedOut) {
    return { key: "", mode: "content", files: files.length, truncated: listing.truncated, timedOut: true, fingerprints: {} };
  }
  const hash = createHash("sha256");
  let mode: ArchitectureCacheMode = "content";
  let hashedBytes = 0;
  const fingerprints: Record<string, string> = {};
  hash.update(JSON.stringify({
    root: absoluteRoot,
    subpath: profile.subpath,
    profile: profile.fingerprint,
    lock: profile.lockFingerprint,
    config: profile.toolkitConfig.config.architecture,
    scanner: ARCHITECTURE_SCANNER_VERSION,
    toolkit: await toolkitVersion(),
    maxFiles: cap,
    truncated: listing.truncated,
  }));
  for (const path of files) {
    if (Date.now() >= deadlineAt) {
      return { key: "", mode, files: files.length, truncated: listing.truncated, timedOut: true, fingerprints };
    }
    const absolutePath = join(absoluteRoot, path);
    try {
      const canonical = await safePath(absoluteRoot, absolutePath, false);
      if (!canonical) throw new Error("PHP file escaped the selected root");
      const fileStat = await stat(canonical);
      hash.update(`\0${path}\0${fileStat.size}\0`);
      if (fileStat.size <= CONTENT_HASH_LIMIT && hashedBytes + fileStat.size <= CONTENT_HASH_BUDGET) {
        const content = await readFile(canonical);
        const canonicalAfterRead = await safePath(absoluteRoot, absolutePath, false);
        if (!canonicalAfterRead || canonicalAfterRead !== canonical) throw new Error("PHP file changed during fingerprinting");
        const fingerprint = `content:${createHash("sha256").update(content).digest("hex")}`;
        fingerprints[path] = fingerprint;
        hash.update(content);
        hashedBytes += fileStat.size;
      } else {
        mode = "metadata";
        fingerprints[path] = `metadata:${fileStat.dev}:${fileStat.ino}:${fileStat.size}:${Math.floor(fileStat.mtimeMs / 1000)}`;
        hash.update(`${fileStat.dev}\0${fileStat.ino}\0${fileStat.mtimeMs}\0metadata-only`);
      }
      if (Date.now() >= deadlineAt) {
        return { key: "", mode, files: files.length, truncated: listing.truncated, timedOut: true, fingerprints };
      }
    } catch {
      hash.update("\0unreadable");
      fingerprints[path] = "unreadable";
    }
  }
  return { key: hash.digest("hex"), mode, files: files.length, truncated: listing.truncated, timedOut: false, fingerprints };
}

export function architectureCacheStorageKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

export async function readArchitectureCache<T>(key: string, storage?: ArchitectureCacheStorage): Promise<T | undefined> {
  const storageKey = architectureCacheStorageKey(key);
  const memory = memoryCache.get(storageKey);
  if (memory !== undefined) return memory as T;
  if (!storage) return undefined;
  try {
    const value = await storage.get(storageKey);
    if (value !== undefined && value !== null) {
      memoryCache.set(storageKey, value);
      return value as T;
    }
  } catch {
    // Cache failures degrade to rescanning; they never turn a valid scan into an error.
  }
  return undefined;
}

export async function writeArchitectureCache<T>(key: string, value: T, storage?: ArchitectureCacheStorage): Promise<void> {
  const storageKey = architectureCacheStorageKey(key);
  memoryCache.set(storageKey, value);
  if (!storage) return;
  try {
    await storage.set(storageKey, value);
  } catch {
    // Persistence is optional; in-memory caching still helps this session.
  }
}

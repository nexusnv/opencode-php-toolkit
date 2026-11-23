import { createHash } from "node:crypto";
import { opendir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, resolve, sep } from "node:path";
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
}

export const ARCHITECTURE_SCANNER_VERSION = "2";
const CACHE_PREFIX = "php-toolkit.architecture-scan.v2.";
const CONTENT_HASH_LIMIT = 1024 * 1024;
const CONTENT_HASH_BUDGET = 16 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 20_000;
const DEFAULT_MAX_FILES = 500;
const memoryCache = new Map<string, unknown>();
let toolkitVersionPromise: Promise<string> | undefined;

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

async function phpFiles(
  root: string,
  maxFiles: number,
  deadlineAt: number,
): Promise<{ files: string[]; truncated: boolean; timedOut: boolean }> {
  const files: string[] = [];
  const pending = [root];
  let visitedEntries = 0;
  let truncated = false;
  while (pending.length > 0) {
    if (Date.now() >= deadlineAt) return { files: files.sort().slice(0, maxFiles), truncated, timedOut: true };
    const directory = pending.pop()!;
    let handle;
    try {
      handle = await opendir(directory);
    } catch {
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
      if (excluded(relativePath) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) childDirectories.push(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".php")) {
        files.push(relativePath.split(sep).join("/"));
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

/** Content fingerprints are exact up to 1 MiB per PHP file; larger files use labeled metadata mode. */
export async function createArchitectureCacheKey(
  root: string,
  profile: ProjectProfile,
  maxFiles = 500,
  deadlineAt = Date.now() + 20_000,
): Promise<ArchitectureCacheIdentity> {
  const absoluteRoot = resolve(root);
  const cap = Math.max(1, Math.min(DEFAULT_MAX_FILES, Math.floor(maxFiles)));
  const listing = await phpFiles(absoluteRoot, cap, deadlineAt);
  const files = listing.files;
  if (listing.timedOut) {
    return { key: "", mode: "content", files: files.length, truncated: listing.truncated, timedOut: true };
  }
  const hash = createHash("sha256");
  let mode: ArchitectureCacheMode = "content";
  let hashedBytes = 0;
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
      return { key: "", mode, files: files.length, truncated: listing.truncated, timedOut: true };
    }
    const absolutePath = join(absoluteRoot, path);
    try {
      const fileStat = await stat(absolutePath);
      hash.update(`\0${path}\0${fileStat.size}\0`);
      if (fileStat.size <= CONTENT_HASH_LIMIT && hashedBytes + fileStat.size <= CONTENT_HASH_BUDGET) {
        hash.update(await readFile(absolutePath));
        hashedBytes += fileStat.size;
      } else {
        mode = "metadata";
        hash.update(`${fileStat.mtimeMs}\0metadata-only`);
      }
      if (Date.now() >= deadlineAt) {
        return { key: "", mode, files: files.length, truncated: listing.truncated, timedOut: true };
      }
    } catch {
      hash.update("\0unreadable");
    }
  }
  return { key: hash.digest("hex"), mode, files: files.length, truncated: listing.truncated, timedOut: false };
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

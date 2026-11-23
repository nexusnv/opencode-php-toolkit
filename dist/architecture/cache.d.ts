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
export declare const ARCHITECTURE_SCANNER_VERSION = "2";
/** Content fingerprints are exact up to 1 MiB per PHP file; larger files use labeled metadata mode. */
export declare function createArchitectureCacheKey(root: string, profile: ProjectProfile, maxFiles?: number, deadlineAt?: number): Promise<ArchitectureCacheIdentity>;
export declare function architectureCacheStorageKey(key: string): string;
export declare function readArchitectureCache<T>(key: string, storage?: ArchitectureCacheStorage): Promise<T | undefined>;
export declare function writeArchitectureCache<T>(key: string, value: T, storage?: ArchitectureCacheStorage): Promise<void>;

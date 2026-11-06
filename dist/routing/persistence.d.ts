import type { SessionRoutingState, StoredSessionRoutingState } from "./types.js";
import { type CreateSessionStateInput } from "./state.js";
export declare const SESSION_STORAGE_PREFIX = "php-toolkit:session:";
export declare const SESSION_RETENTION_MS: number;
export declare function serializeStorageState(state: SessionRoutingState): StoredSessionRoutingState;
export declare function hydrateStorageState(raw: unknown): SessionRoutingState | null;
/** Caches a state and evicts the stalest in-memory entry when full. */
export declare function cacheSessionState(sessions: Map<string, SessionRoutingState>, state: SessionRoutingState): void;
/** Reads persisted routing state without creating a fallback entry. */
export declare function loadPersistedSessionState(storage: {
    get(key: string): Promise<unknown>;
}, sessionID: string): Promise<SessionRoutingState | null>;
export declare function loadOrCreateState(storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
}, sessions: Map<string, SessionRoutingState>, input: CreateSessionStateInput): Promise<SessionRoutingState>;
export interface SessionPruneStorage {
    scan(options: {
        prefix: string;
        after?: string;
        limit?: number;
    }): Promise<{
        entries: ReadonlyArray<{
            key: string;
            value: unknown;
        }>;
        next?: string;
    }>;
    remove(key: string): Promise<void>;
}
/** Removes persisted session documents with no prompt activity for the retention window. */
export declare function pruneStaleRoutingSessions(storage: SessionPruneStorage, now?: number, retentionMs?: number): Promise<number>;
export declare function persistStorageState(storage: {
    set(key: string, value: unknown): Promise<void>;
}, state: SessionRoutingState): Promise<void>;

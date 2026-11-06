import type { SessionRoutingState, StoredSessionRoutingState } from "./types.js";
import { type CreateSessionStateInput } from "./state.js";
export declare const SESSION_STORAGE_PREFIX = "php-toolkit:session:";
export declare function serializeStorageState(state: SessionRoutingState): StoredSessionRoutingState;
export declare function hydrateStorageState(raw: unknown): SessionRoutingState | null;
export declare function loadOrCreateState(storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
}, sessions: Map<string, SessionRoutingState>, input: CreateSessionStateInput): Promise<SessionRoutingState>;
export declare function persistStorageState(storage: {
    set(key: string, value: unknown): Promise<void>;
}, state: SessionRoutingState): Promise<void>;

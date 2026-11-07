import type { ProjectProfile } from "../profile.js";
import type { TaskBoundaryResult } from "./task-boundary.js";
import type { SessionRoutingState, SkillUnactivatedStatus } from "./types.js";
export interface CreateSessionStateInput {
    sessionID: string;
    projectRoot: string;
    projectSubpath: string | null;
    profile?: ProjectProfile;
    mode?: "risk" | "strict" | "off";
    now?: number;
}
export declare function createSessionState(input: CreateSessionStateInput): SessionRoutingState;
export declare function markAttached(state: SessionRoutingState, ids: readonly string[], status?: SkillUnactivatedStatus): void;
export declare function markActivated(state: SessionRoutingState, id: string): void;
export declare function markDenied(state: SessionRoutingState, id: string, reason?: string): void;
export declare function applyTaskBoundary(state: SessionRoutingState, boundary: TaskBoundaryResult, profile: ProjectProfile): SessionRoutingState;
export interface RoutingRenderContext {
    profile: ProjectProfile;
    state: SessionRoutingState;
    boundaryMode?: "continuation" | "ambiguous-continuation" | "new-task" | "reset";
}
/**
 * Render contexts belong to one plugin setup. A module-level map would leak
 * state between plugin instances in the same process, so each setup owns an
 * instance and disposes only its own entries.
 */
export declare class RoutingRenderContexts {
    #private;
    constructor(max?: number);
    set(sessionID: string, value: RoutingRenderContext): void;
    get(sessionID: string): RoutingRenderContext | undefined;
    /** Points an existing context at a re-hydrated state object. */
    syncState(sessionID: string, state: SessionRoutingState): void;
    clear(sessionID: string): void;
    clearAll(): void;
}

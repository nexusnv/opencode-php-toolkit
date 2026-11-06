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
export declare function setRoutingRenderContext(sessionID: string, value: RoutingRenderContext): void;
export declare function getRoutingRenderContext(sessionID: string): RoutingRenderContext | undefined;
export declare function clearRoutingRenderContext(sessionID: string): void;
/** Drops every render context held by this plugin process. */
export declare function clearAllRoutingRenderContexts(): void;

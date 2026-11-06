import type { Plugin } from "@opencode/plugin";
import type { ToolkitConfig } from "../config.js";
import type { MetricsRegistry } from "../metrics/registry.js";
import type { ProjectProfile, ProjectProfileCache } from "../profile.js";
import type { SessionRoutingState } from "./types.js";
export interface RoutePromptInput {
    sessionID: string;
    text: string;
    files: string[];
    skills: Array<{
        id: string;
        mention?: {
            start: number;
            end: number;
            text: string;
        };
    }>;
}
export interface RoutePromptResult {
    explicit: RoutePromptInput["skills"];
    attach: Array<{
        id: string;
    }>;
    profile: ProjectProfile;
    state: SessionRoutingState;
    reasons: string[];
}
export interface SafeRoutingResult {
    explicit: RoutePromptInput["skills"];
    attach: Array<{
        id: string;
    }>;
    error?: string;
}
export declare function runRoutingSafely(run: () => Promise<RoutePromptResult>, explicit?: RoutePromptInput["skills"]): Promise<SafeRoutingResult>;
export declare function runRouting(ctx: Plugin.Context, input: RoutePromptInput, config: ToolkitConfig, profileCache: ProjectProfileCache, sessions: Map<string, SessionRoutingState>, contentLengths: ReadonlyMap<string, number>, metrics: MetricsRegistry): Promise<RoutePromptResult>;

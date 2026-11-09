import type { Plugin } from "@opencode/plugin";
import type { ToolkitConfig } from "../config.js";
import type { VerificationMetrics } from "../metrics/store.js";
import type { ProjectProfile, ProjectProfileCache } from "../profile.js";
import { type RoutingRenderContexts } from "../routing/state.js";
import type { SessionRoutingState } from "../routing/types.js";
export interface ToolkitStatusInput {
    profile: ProjectProfile | null;
    state: SessionRoutingState | null;
    config: ToolkitConfig;
    verification?: VerificationMetrics | null;
}
export declare function renderToolkitStatus(input: ToolkitStatusInput): string;
export declare function buildCurrentStatusSnapshot(ctx: Plugin.Context, input: {
    sessionID: string;
    profileCache: ProjectProfileCache;
    sessions: Map<string, SessionRoutingState>;
    renderContexts?: RoutingRenderContexts;
    config: ToolkitConfig;
    verificationFor?: (root: string) => Promise<VerificationMetrics>;
}): Promise<string>;

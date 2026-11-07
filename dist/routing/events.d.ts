import type { PermissionRule } from "./permissions.js";
import type { SessionRoutingState } from "./types.js";
export declare function applySkillActivatedEvent(state: SessionRoutingState, event: {
    sessionID: string;
    id: string;
}): void;
/**
 * Re-evaluates every attached-but-unactivated skill against the new effective
 * permission snapshot. Permissions events never attach anything; activation
 * remains the only proof that a skill loaded.
 */
export declare function applyPermissionsEvent(state: SessionRoutingState, rules: readonly PermissionRule[]): void;

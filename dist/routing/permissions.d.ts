import type { SelectorResult } from "./selector.js";
import type { SkillUnactivatedStatus } from "./types.js";
export interface PermissionRule {
    action: string;
    resource: string;
    effect: string;
}
export type EffectivePermission = "pending" | "awaiting-approval" | "denied";
/**
 * Interprets the session's effective skill permissions. The last matching
 * rule wins, matching OpenCode's own rule ordering. Absence of a rule is not
 * denial: it only means the host will decide at attachment time.
 */
export declare function effectiveSkillPermission(rules: readonly PermissionRule[], skillID: string): EffectivePermission;
export interface PermissionedAttachment {
    id: string;
    status: SkillUnactivatedStatus;
}
export interface FilteredSelection extends Omit<SelectorResult, "attach"> {
    attach: PermissionedAttachment[];
    deniedRouter: PermissionedAttachment[];
    explicitStatuses: PermissionedAttachment[];
}
/**
 * Applies the session permission snapshot to a selector result. Explicit
 * skills are never removed; denied router skills are removed from `attach`
 * and returned so the orchestrator can persist their denied state.
 */
export declare function filterByPermission(selection: SelectorResult, rules: readonly PermissionRule[], explicitIDs: ReadonlySet<string>): FilteredSelection;

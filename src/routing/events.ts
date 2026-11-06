import type { PermissionRule } from "./permissions.js";
import { effectiveSkillPermission } from "./permissions.js";
import { markActivated } from "./state.js";
import type { SessionRoutingState } from "./types.js";

export function applySkillActivatedEvent(
  state: SessionRoutingState,
  event: { sessionID: string; id: string },
): void {
  if (event.sessionID !== state.sessionID) return;
  markActivated(state, event.id);
}

/**
 * Re-evaluates every attached-but-unactivated skill against the new effective
 * permission snapshot. Permissions events never attach anything; activation
 * remains the only proof that a skill loaded.
 */
export function applyPermissionsEvent(
  state: SessionRoutingState,
  rules: readonly PermissionRule[],
): void {
  for (const skill of state.unactivatedSkills) {
    const effective = effectiveSkillPermission(rules, skill.id);
    if (effective === skill.status) {
      // A permissions event is the only change signal available, so clear a
      // stale two-attempt suppression for skills that remain allowed.
      if (skill.status === "pending" && skill.reason === "activation:not-confirmed") {
        skill.attempts = 0;
      }
      continue;
    }
    skill.status = effective;
    skill.reason = effective === "pending" ? "activation:not-confirmed" : `permission:${effective}`;
    if (effective === "pending") skill.attempts = 0;
  }
}

import { effectiveSkillPermission } from "./permissions.js";
import { markActivated } from "./state.js";
export function applySkillActivatedEvent(state, event) {
    if (event.sessionID !== state.sessionID)
        return;
    markActivated(state, event.id);
}
/**
 * Re-evaluates every attached-but-unactivated skill against the new effective
 * permission snapshot. Permissions events never attach anything; activation
 * remains the only proof that a skill loaded.
 */
export function applyPermissionsEvent(state, rules) {
    for (const skill of state.unactivatedSkills) {
        const effective = effectiveSkillPermission(rules, skill.id);
        // Only a change that affects this skill resets its retry budget. An
        // unrelated permissions event must not re-enable a suppressed skill.
        if (effective === skill.status)
            continue;
        skill.status = effective;
        skill.reason = effective === "pending" ? "activation:not-confirmed" : `permission:${effective}`;
        if (effective === "pending")
            skill.attempts = 0;
    }
}
//# sourceMappingURL=events.js.map
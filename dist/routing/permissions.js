import { globMatches } from "../util/glob.js";
/**
 * Interprets the session's effective skill permissions. The last matching
 * rule wins, matching OpenCode's own rule ordering. Absence of a rule is not
 * denial: it only means the host will decide at attachment time.
 */
export function effectiveSkillPermission(rules, skillID) {
    const matches = rules.filter((rule) => globMatches(rule.action, "skill") && globMatches(rule.resource, skillID));
    if (matches.length === 0)
        return "pending";
    const effect = matches[matches.length - 1].effect;
    if (effect === "deny")
        return "denied";
    if (effect === "ask")
        return "awaiting-approval";
    return "pending";
}
/**
 * Applies the session permission snapshot to a selector result. Explicit
 * skills are never removed; denied router skills are removed from `attach`
 * and returned so the orchestrator can persist their denied state.
 */
export function filterByPermission(selection, rules, explicitIDs) {
    const attach = [];
    const deniedRouter = [];
    const explicitStatuses = [];
    const dropped = [...selection.dropped];
    const reasonCodes = [...selection.reasonCodes];
    for (const id of explicitIDs) {
        explicitStatuses.push({ id, status: effectiveSkillPermission(rules, id) });
    }
    for (const entry of selection.attach) {
        const permission = effectiveSkillPermission(rules, entry.id);
        if (permission === "denied") {
            deniedRouter.push({ id: entry.id, status: "denied" });
            dropped.push({ id: entry.id, reason: "permission:denied" });
            reasonCodes.push("permission:denied");
            continue;
        }
        if (permission === "awaiting-approval") {
            attach.push({ id: entry.id, status: "awaiting-approval" });
            reasonCodes.push("permission:awaiting-approval");
            continue;
        }
        attach.push({ id: entry.id, status: "pending" });
    }
    return {
        ...selection,
        attach,
        dropped,
        reasonCodes: [...new Set(reasonCodes)],
        deniedRouter,
        explicitStatuses,
    };
}
//# sourceMappingURL=permissions.js.map
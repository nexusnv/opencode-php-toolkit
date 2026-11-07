import type { SelectorResult } from "./selector.js";
import type { SkillUnactivatedStatus } from "./types.js";

export interface PermissionRule {
  action: string;
  resource: string;
  effect: string;
}

export type EffectivePermission = "pending" | "awaiting-approval" | "denied";

function globMatches(pattern: string, value: string): boolean {
  let source = "";
  for (const char of pattern) {
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`).test(value);
}

/**
 * Interprets the session's effective skill permissions. The last matching
 * rule wins, matching OpenCode's own rule ordering. Absence of a rule is not
 * denial: it only means the host will decide at attachment time.
 */
export function effectiveSkillPermission(
  rules: readonly PermissionRule[],
  skillID: string,
): EffectivePermission {
  const matches = rules.filter(
    (rule) => globMatches(rule.action, "skill") && globMatches(rule.resource, skillID),
  );
  if (matches.length === 0) return "pending";
  const effect = matches[matches.length - 1].effect;
  if (effect === "deny") return "denied";
  if (effect === "ask") return "awaiting-approval";
  return "pending";
}

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
export function filterByPermission(
  selection: SelectorResult,
  rules: readonly PermissionRule[],
  explicitIDs: ReadonlySet<string>,
): FilteredSelection {
  const attach: PermissionedAttachment[] = [];
  const deniedRouter: PermissionedAttachment[] = [];
  const explicitStatuses: PermissionedAttachment[] = [];
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

import { basename, relative, isAbsolute } from "node:path";
import { globMatches } from "../util/glob.js";
import type { PermissionRule } from "../routing/permissions.js";
import type { CommandDecision } from "../tools/runner.js";

export type CommandPermission =
  | { decision: "allow" }
  | { decision: "deny" }
  | { decision: "approval-required" }
  | { decision: "tool-level-only" };

/** Only bash/shell rules govern spawned commands; skill/tool rules do not. */
export function commandRules(rules: readonly PermissionRule[]): PermissionRule[] {
  return rules.filter(
    (rule) => globMatches(rule.action, "bash") || globMatches(rule.action, "shell"),
  );
}

function commandCandidates(cmd: string, args: readonly string[], cwd: string): string[] {
  const line = [cmd, ...args].join(" ");
  const candidates = new Set<string>([line, cmd, basename(cmd)]);
  if (isAbsolute(cmd)) {
    const rel = relative(cwd, cmd);
    if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
      candidates.add([rel, ...args].join(" "));
      candidates.add(rel);
    }
  }
  return [...candidates];
}

/**
 * Interprets command-level permission rules. The last matching rule wins,
 * matching OpenCode's rule ordering. A command with no matching rule is
 * allowed at tool level: the host already approved the `php_verify` call and
 * exposes no command-level decision for this spawn.
 */
export function evaluateCommand(
  rules: readonly PermissionRule[],
  cmd: string,
  args: readonly string[],
  cwd: string,
): CommandPermission {
  const candidates = commandCandidates(cmd, args, cwd);
  let match: PermissionRule | undefined;
  for (const rule of commandRules(rules)) {
    if (candidates.some((candidate) => globMatches(rule.resource, candidate))) match = rule;
  }
  if (!match) return { decision: "tool-level-only" };
  if (match.effect === "deny") return { decision: "deny" };
  if (match.effect === "ask") return { decision: "approval-required" };
  return { decision: "allow" };
}

export function toCommandDecision(permission: CommandPermission): CommandDecision {
  if (permission.decision === "deny") return { allowed: false, reason: "permission:denied" };
  if (permission.decision === "approval-required") {
    return { allowed: false, reason: "permission:approval-required" };
  }
  return { allowed: true };
}

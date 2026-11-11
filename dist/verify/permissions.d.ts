import type { PermissionRule } from "../routing/permissions.js";
import type { CommandDecision } from "../tools/runner.js";
export type CommandPermission = {
    decision: "allow";
} | {
    decision: "deny";
} | {
    decision: "approval-required";
} | {
    decision: "tool-level-only";
};
/** Only bash/shell rules govern spawned commands; skill/tool rules do not. */
export declare function commandRules(rules: readonly PermissionRule[]): PermissionRule[];
/**
 * Interprets command-level permission rules. The last matching rule wins,
 * matching OpenCode's rule ordering. A command with no matching rule is
 * allowed at tool level: the host already approved the `php_verify` call and
 * exposes no command-level decision for this spawn.
 */
export declare function evaluateCommand(rules: readonly PermissionRule[], cmd: string, args: readonly string[], cwd: string): CommandPermission;
export declare function toCommandDecision(permission: CommandPermission): CommandDecision;

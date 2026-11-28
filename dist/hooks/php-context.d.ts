export declare const PHP_TRIGGER: RegExp;
/**
 * Only shell command inputs are inspected: a raw command string or an object's
 * `command` field. Other fields (commit messages, prompts, file contents) and
 * quoted text are deliberately ignored so prose mentioning a destructive tool
 * does not warn.
 */
export declare function isDestructiveShell(input: unknown): string | null;

export const PHP_TRIGGER = /(php|composer|phpunit|pest|phpstan|psalm|rector|cs-fixer|phpcs|mago|xdebug)/i;

const DESTRUCTIVE = [
  /composer\s+update\b/,
  /rector\s+process\b(?![\s\S]*--dry-run)/,
  /php-cs-fixer\s+fix\b(?![\s\S]*--dry-run)/,
  /phpcbf\b/,
];

/**
 * Only shell command inputs are inspected: a raw command string or an object's
 * `command` field. Other fields (commit messages, prompts, file contents) and
 * quoted text are deliberately ignored so prose mentioning a destructive tool
 * does not warn.
 */
export function isDestructiveShell(input: unknown): string | null {
  const commands: string[] = [];
  if (typeof input === "string") commands.push(input);
  else if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const command = (input as Record<string, unknown>).command;
    if (typeof command === "string") commands.push(command);
  }
  for (const command of commands) {
    // Quoted text is data (e.g. a commit message), not a command to warn about.
    const executable = command.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, " ");
    for (const re of DESTRUCTIVE) {
      if (re.test(executable)) return re.source;
    }
  }
  return null;
}

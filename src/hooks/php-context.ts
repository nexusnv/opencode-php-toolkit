export const PHP_SYSTEM_HINT =
  "Prefer typed, framework-agnostic PHP 8.1+. " +
  "Use strict_types=1, constructor promotion, readonly, enums, union/intersection types, attributes. " +
  "Prefer PHPStan (level 6+ with baseline) or Psalm + PHPUnit/Pest with data providers. " +
  "Rector and CS-Fixer: dry-run first, show diff, apply only on approval. " +
  "Composer: validate before audit/outdated; never commit without lock check.";

export const PHP_TRIGGER = /(php|composer|phpunit|pest|phpstan|psalm|rector|cs-fixer|phpcs|mago|xdebug)/i;

const DESTRUCTIVE = [
  /composer\s+update\b/,
  /rector\s+process\b(?![\s\S]*--dry-run)/,
  /php-cs-fixer\s+fix\b(?![\s\S]*--dry-run)/,
  /phpcbf\b/,
];

export function isDestructiveShell(input: unknown): string | null {
  let text = "";
  try {
    text = JSON.stringify(input ?? "");
  } catch {
    text = String(input ?? "");
  }
  for (const re of DESTRUCTIVE) {
    if (re.test(text)) return re.source;
  }
  return null;
}

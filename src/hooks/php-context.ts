export const PHP_SYSTEM_HINT =
  "Prefer typed, framework-agnostic PHP 8.1+. " +
  "Use strict_types=1, constructor promotion, readonly, enums, union/intersection types, attributes. " +
  "Prefer PHPStan (level 6+ with baseline) or Psalm + PHPUnit/Pest with data providers. " +
  "Rector and CS-Fixer: dry-run first, show diff, apply only on approval. " +
  "Composer: validate before audit/outdated; never commit without lock check.";

export const PHP_TRIGGER = /(php|composer|phpunit|pest|phpstan|psalm|rector|cs-fixer|phpcs|mago|xdebug)/i;

/**
 * Minimal, structural view of a chat message - the v2 SessionContext's
 * `messages` is assignable to this, without this module importing the AI
 * schema. Text parts longer than this are not fully scanned.
 */
const MAX_TEXT_SCAN = 8000;
type MessageLike = { role?: unknown; content?: unknown };

/** True when a user message in this request mentions the PHP ecosystem. */
export function mentionsPhp(messages: ReadonlyArray<MessageLike> | undefined): boolean {
  if (!Array.isArray(messages)) return false;
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    if (message.role !== "user") continue;
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if ((part as { type?: unknown }).type === "text" && typeof text === "string") {
        if (PHP_TRIGGER.test(text.slice(0, MAX_TEXT_SCAN))) return true;
      }
    }
  }
  return false;
}

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

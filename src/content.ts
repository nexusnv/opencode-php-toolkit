import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// src/ -> package root
export const PKG_ROOT = join(here, "..");

export async function loadText(rel: string): Promise<string> {
  return readFile(join(PKG_ROOT, rel), "utf8");
}

export function parseFrontmatter(body: string): { front: Record<string, string>; content: string } {
  if (!body.startsWith("---")) return { front: {}, content: body };
  const end = body.indexOf("\n---", 3);
  if (end === -1) return { front: {}, content: body };
  const raw = body.slice(3, end).trim();
  const content = body.slice(end + 4).replace(/^\n/, "");
  const front: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (m) front[m[1]] = m[2].trim();
  }
  return { front, content };
}

export const SKILL_IDS = [
  "php-standards",
  "php-static-analysis",
  "php-testing",
  "php-security",
  "php-modernize",
  "php-composer",
  "php-architecture",
  "php-debug",
] as const;

export const COMMAND_DEFS = [
  { file: "commands/php-review.md", name: "php-review", fallback: "Review PHP code for correctness, security, and style" },
  { file: "commands/php-analyze.md", name: "php-analyze", fallback: "Run PHP static analysis guidance (PHPStan/Psalm)" },
  { file: "commands/php-fix-style.md", name: "php-fix-style", fallback: "Fix PHP code style (dry-run first)" },
  { file: "commands/php-test.md", name: "php-test", fallback: "Run and improve PHP tests (PHPUnit/Pest)" },
  { file: "commands/php-audit.md", name: "php-audit", fallback: "Audit PHP dependencies and security" },
  { file: "commands/php-upgrade.md", name: "php-upgrade", fallback: "Plan PHP 8.1+ upgrade with Rector dry-run" },
  { file: "commands/php-scaffold.md", name: "php-scaffold", fallback: "Scaffold PSR-4 PHP class + test" },
] as const;

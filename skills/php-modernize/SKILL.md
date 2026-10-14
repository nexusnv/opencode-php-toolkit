---
name: PHP Modernize
description: Upgrade PHP safely with Rector dry-run-first, deprecation fixes, and PHP 8.1+ syntax. Use for migrations and tech-debt paydown.
---

# PHP Modernize

- Always `vendor/bin/rector process --dry-run`, review diff, then apply. Same for CS-Fixer `--dry-run --diff`.
- Rector sets: start with `dead-code`, `code-quality`, then `php81/php82/php83/php84` migration sets. One set per diff.
- Mappings: string constants→enums, annotations→attributes, switch→match, nullable docblocks→native union types, `DateTime`→`DateTimeImmutable` where sensible.
- Bump `require.php` + `ext-*`, update CI matrix, run `php -l` + phpstan + tests.
- Never combine modernization with feature work. Keep diffs reviewable.

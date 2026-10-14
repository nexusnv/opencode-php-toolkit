---
description: Fix PHP code style (dry-run first)
---

Fix style for $ARGUMENTS.

Dry-run first (`vendor/bin/php-cs-fixer fix --dry-run --diff`, `vendor/bin/phpcs`), show diff, then apply only on approval. Target PSR-12 + strict_types. If no tool configured, propose minimal `.php-cs-fixer.php` and install command. Never run fixer with prod side effects.

---
description: Plan PHP 8.1+ upgrade with Rector dry-run
---

Plan upgrade for $ARGUMENTS to PHP 8.1+.

Check `composer.json` php requirement, extensions, CI matrix, deprecations. Propose Rector sets + `rector process --dry-run` diff, then PHP req bump. Separate modernization from behavior changes. List verification: `php -l`, phpstan/psalm, tests.

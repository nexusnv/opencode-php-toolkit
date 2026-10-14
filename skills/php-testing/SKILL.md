---
name: PHP Testing
description: Test PHP behavior with PHPUnit/Pest, data providers, fixtures, and coverage gaps. Use when writing or repairing tests.
---

# PHP Testing

- Detect runner: `phpunit.xml*` vs `tests/Pest.php`. Don't mix styles in one suite.
- Behavior via public API. Data providers/datasets over duplicated cases.
- Cases: happy, boundaries, null/empty, exceptions with messages, error paths.
- Commands: `vendor/bin/phpunit --testdox`, `vendor/bin/phpunit --filter Foo`, `vendor/bin/pest`, `XDEBUG_MODE=coverage vendor/bin/phpunit --coverage-text`.
- Assertions: exact values/types; no `assertTrue(count()>0)`.
- Doubles: prefer real collaborators + fakes; mock only boundaries.
- Mutation (if Infection): note survivors, strengthen assertions; don't chase 100% blindly.

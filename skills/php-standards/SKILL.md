---
name: PHP Standards
description: Write idiomatic typed PHP 8.1+ with PSR-4/PSR-12, strict types, and modern syntax. Use for new code, refactors, and style reviews.
---

# PHP Standards

Framework-agnostic. PHP 8.1+ baseline.

## Must

- `declare(strict_types=1);` in every file.
- PSR-4 autoloading; one class per file; `composer dump-autoload` after moves.
- Type everything: params, returns, properties. Prefer `array{price: float, qty: int}` shapes and `array<int, User>` generics via PHPDoc where they prevent bugs.
- Prefer: constructor promotion, `readonly`, enums, `match`, named args, attributes.
- PSR-12 formatting; no trailing whitespace; short array syntax.

## Must not

- Superglobals deep in domain code; unvalidated `$_GET/$_POST`; `eval`; silenced `@` errors; `var_dump` left in.
- Framework-specific magic in generic code. Defer Laravel/Symfony specifics to sibling toolkits.

## Check

`php -l`, `composer validate`, fixer `--dry-run --diff` before apply.

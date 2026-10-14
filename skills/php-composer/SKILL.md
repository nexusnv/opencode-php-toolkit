---
name: PHP Composer
description: Manage Composer correctly — validate, audit, outdated, lock conflicts, autoload, scripts. Use for dependency tasks.
---

# PHP Composer

- `composer validate --no-check-publish` before anything. Commit `composer.lock` for apps, not for libs.
- Semver: `^8.1` vs `~8.1` vs `>=8.1`; prefer caret. Check `php` + `ext-*` + platform in `config.platform`.
- `composer outdated --direct`, `composer audit`, `composer why vendor/pkg`, `composer why-not php:8.3`.
- Lock conflicts: `composer update --lock` first; targeted `composer update vendor/pkg --with-dependencies`, never blind full update in prod PRs.
- Autoload: PSR-4 roots correct, `composer dump-autoload -o` for prod, `optimize-autoloader` + `audit` in CI.
- Scripts: use composer scripts for `test`, `stan`, `cs`, `rector-dry` so opencode/CI share one entry.

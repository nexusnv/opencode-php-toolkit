---
name: PHP Static Analysis
description: Configure and climb PHPStan/Psalm without rewrites, use baselines, taint analysis, and fast Mago path. Use when adding analysis or triaging reports.
---

# PHP Static Analysis

## PHPStan (most-installed, best extension ecosystem)

- Start legacy-safe: `vendor/bin/phpstan analyse --level=6 --generate-baseline`, commit `phpstan-baseline.neon`, climb 6→9.
- Levels 0–9: 0 catches typos/unknown symbols; 9 enforces full types. Raise deliberately.
- Extensions: Larastan/Symfony/Doctrine/PHPUnit only when framework present; core stays agnostic.

## Psalm (stricter default + taint)

- `vendor/bin/psalm --init`, `vendor/bin/psalm --set-baseline=psalm-baseline.xml`.
- Lowest Psalm ≈ mid PHPStan. Use taint analysis for XSS/SQLi paths.
- Many teams run both; dialects for generics mostly compatible.

## Mago (Rust, fast)

- Single binary, no PHP bootstrap. Use for quick feedback; keep PHPStan/Psalm as source of truth for types/security.

## Workflow

1. Detect configs + versions. 2. Baseline, don't fix-the-world. 3. Fix new issues first, burn down baseline. 4. Add generics/array-shapes where they kill a bug class.

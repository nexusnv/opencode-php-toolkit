---
description: Run PHP static analysis guidance (PHPStan/Psalm)
---

Analyze $ARGUMENTS with static analysis.

1. Detect config: phpstan.neon, psalm.xml, composer dev deps. If missing, propose minimal level-6 PHPStan start + baseline (`vendor/bin/phpstan analyse --level=6 --generate-baseline`), or Psalm init.
2. Explain how to climb levels without rewrite (baseline, excludePaths for legacy).
3. Call out generics/array-shapes via PHPDoc where they remove a class of bugs.

Show exact commands. Do not claim output without running.

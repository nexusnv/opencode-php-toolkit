---
description: Scaffold PSR-4 PHP class + test
---

Scaffold $ARGUMENTS as PSR-4 class + matching test.

Use: `declare(strict_types=1);`, typed signatures, readonly/constructor promotion where fitting, PHPDoc generics/array-shapes only where they add safety. Create test with data provider (PHPUnit) or dataset (Pest). Show `composer dump-autoload` + run command. Args: $1 = FQCN, $2 = optional target dir hint.

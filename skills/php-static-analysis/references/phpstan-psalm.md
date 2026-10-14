# PHPStan vs Psalm — quick reference

Both free, MIT, production-grade. Pick one and run it; many teams run both.

- PHPStan 2.x: phar, levels 0–9. Legacy-safe start at 6 + baseline. Largest extension ecosystem (Larastan, Symfony, Doctrine, PHPUnit).
- Psalm 6.x: stricter default, taint analysis built-in. `--set-baseline` workflow mirrors PHPStan.
- Generics via PHPDoc: `array<int, User>`, `array{price: float, qty: int}`, `@template T`. Dialects mostly compatible.
- CI: fail on new issues only (baseline), burn down old ones incrementally.

---
name: PHP Architecture
description: Keep PHP decoupled with layers, dependency rules, and metrics. Use for structure reviews and refactoring plans.
---

# PHP Architecture

- Layers: HTTP/In → Application → Domain → Infrastructure. Domain must not depend on infra/framework.
- Enforce: Deptrac (`deptrac analyse`), PHPArkitect, or at minimum `composer why` + manual boundary review.
- Metrics smells: `phpcpd` duplicates, `phpmd` (cyclomatic/npath), PhpMetrics. Fix duplication before abstraction; composition over inheritance; single responsibility per class.
- Public API: mark `@api` entry points, keep BC for libs, suggest next version via semver checker.
- Refactor rule: smallest boundary that removes the pain; no unrelated rewrites. Follow existing layout.

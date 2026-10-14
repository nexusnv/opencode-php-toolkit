---
description: Audit PHP dependencies and security
---

Audit PHP dependencies.

Run `composer validate`, then `composer audit --format=json`, then `composer outdated --direct`. Summarize: EOL PHP risk, vulnerable packages with CVE + fix version, major-only vs patch upgrades. Propose minimal safe update set. Never run `composer update` without explicit approval.

---
name: PHP Security
description: Secure PHP with composer audit, input validation, output escaping, and secrets hygiene. Use for audits and security reviews.
---

# PHP Security

- `composer validate` → `composer audit --format=json` → `composer outdated --direct`. EOL PHP (55% of teams per 2024 Zend survey) is itself a finding.
- Taint mindset: `$_GET/$_POST/$_COOKIE/$_FILES`, headers, DB rows are tainted until validated. Validate allow-list, escape on output (XSS), prepared statements (SQLi), no shell interpolation.
- Secrets: env only, never committed; `.env.example` without values; rotate on leak.
- Uploads/deserialization: mime + size checks, random filenames outside webroot; avoid `unserialize` on user input.
- Report: CVE + affected package + fix version + exploitability; separate real edge cases from hypotheticals.

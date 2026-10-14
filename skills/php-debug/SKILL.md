---
name: PHP Debug
description: Diagnose PHP bugs systematically — reproduce, isolate, hypothesize, verify. Use when something is broken, failing, or slow.
---

# PHP Debug

1. Repro: exact command, input, `php -v`, `composer validate`, failing test with output.
2. Isolate: `php -l`, bisect commits, minimal provider case, disable opcache/Xdebug to rule out.
3. Hypotheses: 2–3 candidates, cheapest disproof first. Check logs before code.
4. Fix + regression test. Verify by execution; quote output.
5. Perf: Xdebug trace, Blackfire/`strace` hints, opcache settings; measure before optimizing.

Never propose fixes without evidence. Keep tool calls read-only until cause is proven.

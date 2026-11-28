---
description: Shape a PHP design and proceed with low-risk implementation
---

Design the approach for: $ARGUMENTS

Inspect the relevant code and project profile first. Keep the note concise and concrete: goal, constraints, current code path, proposed approach, trade-off, affected files/modules, and how to verify it.

Scale the process to impact:
- Small and reversible (one method/class, no public API or dependency change): state a one-line rationale and proceed when implementation was requested.
- Moderate (new service/interface, several classes, or a dependency): state the chosen pattern and its trade-off in 2–3 lines, then proceed when implementation was requested unless the user asked only for design.
- Significant (module boundaries, persistence, messaging/events, dependency-injection strategy, security/data-model implications, or breaking public API): present 2–3 options with trade-offs, blast radius, compatibility implications, and test strategy; stop and ask for approval.

Do not invent framework conventions. If the requested change is design-only, do not implement it. If the scope is unclear, ask the one question whose answer would change the design most.

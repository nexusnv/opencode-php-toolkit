# PHP Toolkit Reactive Engineering Master Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` only after the phase plan is created. This roadmap is the coordination source, not an implementation plan. Each phase gets its own plan under `docs/superpowers/plans/`.

**Goal:** Deliver the full reactive engineering guidance design in independently shippable, reviewable phases without turning the toolkit into an autonomous architect.

**Architecture:** Knowledge (skills/references/constitution), guidance (profile/router/risk-aware architecture behavior), and verification (`php_verify`) remain separate responsibilities. Deterministic routing is default; LLM routing is opt-in later. Verification reports evidence instead of trusting claims.

**Tech Stack:** TypeScript ESM, `@opencode/plugin@2.0.26` (locked compatibility contract), Node 20+, PHP 8.1+ fixtures, Vitest, PHP analyzer fixtures, OpenCode v2 hooks/events.

---

## 1. Source of truth and scope

Primary specification:

- `docs/superpowers/specs/2026-11-04-reactive-engineering-design.md`

This roadmap sequences that spec. It does not replace it. When a conflict exists, the spec wins unless the conflict is explicitly resolved in a new decision note or ADR.

Scope included:

- Phase 1 — Foundation
- Phase 2 — Pattern library and architecture behavior
- Phase 3 — Verification
- Phase 4 — Architect surface and diagnostics
- Phase 5 — Architecture scanner
- Phase 6 — Drift detection and feedback
- Phase 7 — Advanced routing

Explicit non-goals:

- Framework-specific semantics in this package.
- Automatic architecture rewrites.
- Replacing PHPStan, Psalm, PHPUnit, Pest, PHPCS or CS-Fixer.
- Mandatory approvals for ordinary changes.
- LLM classification as the default path.
- Bypassing OpenCode permission rules.
- Treating a passing lint as proof that a feature works.

## 2. Planning policy

- One plan per phase.
- Each phase must produce independently testable software.
- A later phase plan is created only after the previous phase's acceptance gates are met, or its prerequisites are explicitly satisfied.
- Phase 2 and Phase 3 may be implemented in parallel after Phase 1 because they touch different primary surfaces, but both consume the Phase 1 router/state contract.
- Phase 3 must not depend on the unimplemented Phase 5 scanner.
- Phase 6 and Phase 7 are not planned in detail until Phases 1–5 are accepted.
- The master roadmap is updated when a phase completes or a decision changes.

Current plans:

| Plan | Status | Path |
| --- | --- | --- |
| Phase 1 — Foundation | Created | `docs/superpowers/plans/2026-11-04-reactive-engineering-phase-1-foundation.md` |
| Phase 2 — Pattern Library and Architecture Behavior | Created | `docs/superpowers/plans/2026-11-04-reactive-engineering-phase-2-pattern-library.md` |
| Phase 3 — Verification | Created | `docs/superpowers/plans/2026-11-04-reactive-engineering-phase-3-verification.md` |
| Phase 4 — Architect Surface and Diagnostics | Not created | `docs/superpowers/plans/2026-11-04-reactive-engineering-phase-4-architect-surface.md` |
| Phase 5 — Architecture Scanner | Not created | `docs/superpowers/plans/2026-11-04-reactive-engineering-phase-5-scanner.md` |
| Phase 6 — Drift Detection and Feedback | Deferred | `docs/superpowers/plans/2026-11-04-reactive-engineering-phase-6-drift.md` |
| Phase 7 — Advanced Routing | Deferred | `docs/superpowers/plans/2026-11-04-reactive-engineering-phase-7-advanced-routing.md` |

## 3. Target release sequence

Release numbers are planning targets, not a commitment to publish all of them.

| Milestone | Contents | Behavior change |
| --- | --- | --- |
| `0.2.0` | Phase 1 Foundation | Reactive routing exists; default is silent, risk-based and bypassable; existing IDs remain valid |
| `0.3.0` | Phase 2 Pattern Library | Pattern guidance is attached only when a real design problem exists |
| `0.4.0` | Phase 3 Verification | Build/Design/Test work gets evidence-backed completion checks |
| `0.5.0` | Phase 4 Architect Surface | Optional design-first workflow and richer diagnostics |
| `0.6.0` | Phase 5 Scanner | On-demand, advisory structure scanner and configured boundaries |
| `0.7.0` | Phase 6 Drift Feedback | Opt-in, quiet feedback after boundary-relevant edits |
| `1.0.0` or later | Phase 7 Advanced Routing | Optional LLM-assisted classification, sibling-toolkit shared contract |

The first public behavior change ships in `0.2.0`. README and CHANGELOG must explicitly call out the new automatic attachment behavior, the `autoSkills: "off"` escape hatch and the silent default.

## 4. Dependency graph

```text
                    ┌─────────────────────┐
                    │ Phase 1 Foundation  │
                    │  router + state +   │
                    │  profile + L0       │
                    └──────────┬──────────┘
                               │
             ┌─────────────────┴─────────────────┐
             │                                   │
             ▼                                   ▼
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ Phase 2 Pattern Library      │     │ Phase 3 Verification         │
│ index + promoted skills      │     │ php_verify + changed scope   │
│ architecture behavior        │     │ permissions + status report   │
└──────────────┬──────────────┘     └──────────────┬──────────────┘
               │                                   │
               ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 4 Architect Surface                                        │
│ /php-design, /php-architect, php-architect agent, diagnostics   │
└─────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 5 Architecture Scanner                                     │
│ token_get_all scanner, php-toolkit.json boundaries, cache        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 6 Drift Detection and Feedback                            │
│ edit-time signals, config-gated auto checks, drift summaries    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 7 Advanced Routing                                         │
│ optional LLM classifier, shared sibling-toolkit contract         │
└─────────────────────────────────────────────────────────────────┘
```

Allowed parallel work after Phase 1:

- Phase 2 content/catalog work and Phase 3 verification orchestration.
- Documentation and fixture preparation may be shared, but implementation reviews remain separate.
- Phase 5 may be spiked early for performance and `token_get_all` feasibility, but it cannot be shipped before its own acceptance gates.

Forbidden shortcuts:

- No attachment of unresolved skill IDs.
- No verification result of `passed` when changed scope cannot be determined.
- No Phase 3 dependency on Phase 5 scanner classes.
- No `session.instructions.entry` dependency on locked `@opencode/plugin@2.0.26`.
- No automatic routing announcement through synthetic messages.

## 5. Phase exit gates

### Phase 1 — Foundation (`0.2.0`)

Deliverables:

- Engineering constitution (L0).
- Per-session project profile with application/library confidence.
- Routing catalog for the eight existing skills.
- Deterministic intent × concern classifier and selector.
- Task-generation state machine.
- Prompt/context hooks with compaction as a separate no-op.
- Selected/attached/activated/pending/awaiting-approval/denied state model.
- `session.skill.activated` and `session.permissions` subscriptions.
- Best-effort `ctx.storage` persistence.
- `/php-toolkit-status` diagnostics.
- Metrics v3 migration.
- Routing/profile/session tests.

Exit gate:

- [ ] Non-PHP prompts attach nothing.
- [ ] Review prompts attach review skills; build prompts attach build skills.
- [ ] Explicit `@skill-id` is preserved and never router-dropped.
- [ ] Budget is enforced; dropped entries carry reason codes.
- [ ] Two sessions in different roots have isolated profiles.
- [ ] A worktree/second checkout does not share profile or task state.
- [ ] Unrelated strong-intent task does not inherit prior concerns.
- [ ] Unactivated skills are not marked loaded; permission denial is not bypassed.
- [ ] `ask` skills attach once and are not re-attached while awaiting approval.
- [ ] Compaction receives no routing state.
- [ ] Routing/storage failure never breaks prompt admission.
- [ ] All existing tests pass; Phase 1 routing corpus passes expected skill sets.
- [ ] `/php-toolkit-status` reports profile, confidence, task generation, selection and reasons.

### Phase 2 — Pattern Library and Architecture Behavior (`0.3.0`)

Deliverables:

- `php-design-patterns` router/index skill with problem-first table.
- Four promoted P0 core skills: strategy, adapter, decorator, state.
- Long-tail references with mandatory problem/forces/solution/trade-offs/when-not-to-use/testing sections.
- Pattern selection rules including two-pattern tasks.
- Risk-based architecture mode in state guidance.
- Catalog/content validation tests.
- Full routing corpus unlocked, including pattern expectations.

Exit gate:

- [ ] Narrow pattern prompt attaches the relevant core pattern skill.
- [ ] Two distinct named promoted patterns may attach two core skills within budget.
- [ ] Comparison/unnamed pattern questions route to the index.
- [ ] Small changes are not gated; significant changes request approval.
- [ ] Repository is not promoted in P0; its reference explains when it is unnecessary.
- [ ] Pattern-tourism review passes on evaluation corpus.
- [ ] Model reads at most two references in evaluation runs.

### Phase 3 — Verification (`0.4.0`)

Deliverables:

- `php_verify` with lint, composer, tests, static, style and architecture checks.
- Per-check and aggregate statuses normalized and deterministic.
- VCS-derived changed scope through host API.
- Production-to-test mapping with full-suite fallback.
- Host permission-aware execution adapter.
- Completion reminder for Build/Design/Test.
- Verification metrics.
- Fake-binary integration tests.

Exit gate:

- [ ] Never passes production paths as test paths.
- [ ] Never passes when changed scope cannot be determined; aggregate is `partial` or `unavailable` as appropriate.
- [ ] Never installs tools or edits configuration.
- [ ] Denied commands are reported as cancelled/unavailable, never bypassed.
- [ ] Deptrac is used only when configured; otherwise architecture is `skipped: scanner-unavailable`.
- [ ] Build/Design/Test tasks receive the completion reminder.
- [ ] Evaluation shows improved completion reporting.

### Phase 4 — Architect Surface and Diagnostics (`0.5.0`)

Deliverables:

- `php-architect` design-first, read-only-until-approval agent.
- `/php-design` fluid design note.
- `/php-architect` approval-gated workflow.
- Postinstall copy and README documentation.
- Extended `/php-toolkit-status` with verification/scan state.

Exit gate:

- [ ] Agent file is copied on install and never overwrites modified files.
- [ ] `/php-design` proceeds for non-significant changes.
- [ ] `/php-architect` always stops for approval.
- [ ] Status output reflects routing and verification state.
- [ ] No additional specialist agents are introduced.

### Phase 5 — Architecture Scanner (`0.6.0`)

Deliverables:

- `scripts/architecture-scan.php` using `token_get_all`, no Composer dependency.
- `php_architecture_scan` tool.
- `php_verify` architecture adapter for configured boundaries.
- `php-toolkit.json` validation.
- Content/config/version cache; metadata-only mode is explicitly best-effort.
- Fixture and performance tests.

Exit gate:

- [ ] Objective findings are separated from hypotheses.
- [ ] No layer violation without configured boundaries.
- [ ] Cache invalidates on file/config/lock/toolkit changes.
- [ ] Scanner is read-only, bounded by `maxFiles` and timeout.
- [ ] Auto mode is opt-in; default remains on-demand.

### Phase 6 — Drift Detection and Feedback (`0.7.0` or experimental)

Deliverables:

- Edit-time signals for boundary-relevant changes.
- Config-gated auto lint/check feedback.
- Architecture drift summary.
- Metrics for drift findings.

Exit gate:

- [ ] No noisy reminder on every edit.
- [ ] All feedback can be disabled.
- [ ] Large repositories remain responsive.
- [ ] False-positive feedback is measurable and bounded.

### Phase 7 — Advanced Routing

Deliverables:

- Optional LLM-assisted classifier behind explicit configuration.
- Deterministic fallback and veto for policy/permissions.
- Shared router contract for sibling toolkits.
- More evaluation cases and references.

Exit gate:

- [ ] Deterministic routing remains default.
- [ ] LLM routing never runs without explicit opt-in.
- [ ] Permissions, budgets and task boundaries remain deterministic and enforced after LLM output.
- [ ] Sibling toolkits can reuse the contract without forking.

## 6. Cross-phase specification coverage matrix

| Spec section | Phase |
| --- | --- |
| 1 Summary | Phase 1 establishes; all phases complete |
| 2 Problem and goals | All phases |
| 3 Design principles | Phase 1; enforced in every phase |
| 4 Architecture | Phase 1 runtime skeleton; Phases 2–7 extend deliberately |
| 5 Project Profile | Phase 1 |
| 6 Engineering constitution | Phase 1 |
| 7 Routing | Phase 1; Phase 2 unlocks pattern routing; Phase 7 optional LLM |
| 8 Pattern library | Phase 2 |
| 9 Architecture behavior | Phase 2 for risk mode; Phase 4 for architect workflow |
| 10 Verification layer | Phase 3 |
| 11 Architecture scanner | Phase 5; Phase 3 reports unavailable until then |
| 12 Surfaces | Phase 1 routing surfaces; Phase 2 skills; Phase 3 tool; Phase 4 commands/agent |
| 13 Configuration | Phase 1 plugin options; later phases add scanner/drift flags |
| 14 Metrics and observability | Phase 1 metrics v3; later phases add metrics |
| 15 Testing and evaluation | Phase 1 corpus subset; Phase 2 full corpus; each phase adds fixtures |
| 16 Phases and acceptance criteria | This roadmap and individual plans |
| 17 Migration and compatibility | Phase 1 release migration; all phases preserve IDs |
| 18 Risks and mitigations | All phases |
| 19 Validation assumptions | Phase 1 verifies assumptions; later phases re-check relevant ones |
| 20 Self-review | Revisit before each release |

## 7. Shared engineering gates

Every phase PR must pass:

```bash
npm ci
npm run typecheck
npm test
npm run build
git add -A -- dist && git diff --cached --exit-code -- dist
node -e "import('./dist/index.js').then(m => { if (m.default.id !== 'php-toolkit') process.exit(1) })"
npm pack --dry-run
```

Also required:

- [ ] `README.md` describes the new behavior and configuration.
- [ ] `CHANGELOG.md` has an entry with migration/escape hatch details.
- [ ] Existing skill IDs, command names, tool names and agent files remain valid.
- [ ] No prompt text, code or file contents are persisted in metrics or storage documents.
- [ ] No bypass of `ask`/`deny` permission rules.
- [ ] New behavior is opt-out where it changes user experience.
- [ ] `dist/` is rebuilt and committed.
- [ ] CI matrix passes on supported Node versions.

## 8. Test strategy by phase

### Unit and contract tests

- Classifier normalization, signal matching, tie-breaks and thresholds.
- Profile scoring and confidence.
- Budget and drop reasons.
- Task-generation transitions and reset behavior.
- Storage round-trip, corrupt-storage recovery and unpersisted fallback.
- Metrics migration from v2 to v3.

### Integration tests

- Prompt hook with fake event and fake session getter.
- Context hook removes previous parts and appends L0 plus one state part.
- Activation events mark only matching session/skill.
- Permission events clear denied/awaiting-approval states.
- Verifier orchestration with fake `php`, `composer`, `phpunit`, `phpstan`, `php-cs-fixer` binaries.
- Scanner JSON output against fixture files.

### Evaluation corpus

- `test/fixtures/routing-corpus.json` is the minimum contract.
- Phase 1 runs cases whose expected skills exist; pattern-dependent cases remain gated until Phase 2.
- Phase 2 unlocks the full corpus and requires exact selected-skill sets.
- Every rule or signal change must add or update a case.
- Precision target on strong/explicit prompts: `>= 90%`.
- False-positive routing on non-PHP/ambiguous prompts: `< 5%`.
- Concern leakage into an unrelated new task: `0`.

### Fixtures

Committed fixtures under `fixtures/`:

- `fixtures/php-app/`
- `fixtures/php-app-no-type/`
- `fixtures/php-library/`
- `fixtures/php-library-no-type/`
- `fixtures/php-library-conflicting/`
- `fixtures/php-legacy/`
- `fixtures/php-framework/`
- `fixtures/php-no-tools/`
- `fixtures/php-bad-architecture/` (Phase 5)

Worktree isolation is tested with temporary copies of `fixtures/php-app`; no committed nested git repository is required.

## 9. Risk register and owning phase

| Risk | Mitigation | Owner |
| --- | --- | --- |
| Hidden skills cannot be attached | Phase 1 spike; advertised index fallback | Phase 1 |
| Composer `type` omits/invalidates app detection | Missing type neutral; multi-signal scoring; fixtures | Phase 1 |
| Concerns accumulate across tasks | Task generations; confirmed-continuation merge only | Phase 1 |
| Attached mistaken for loaded | Activation event is sole proof; explicit lifecycle states | Phase 1 |
| Host permission rules bypassed | CommandRunner for Phase 3; attachment denial handling in Phase 1 | Phases 1, 3 |
| Verification reports success with unknown scope | Changed-scope `unavailable`; deterministic aggregate `partial` | Phase 3 |
| Verification executes untrusted project code | Non-mutating contract; no installs; timeout; permissions; explicit docs | Phase 3 |
| Pattern tourism | When-not-to-use sections; staged promotion; corpus review | Phase 2 |
| Pattern library becomes content project | Promote only proven core skills; references for long tail | Phase 2 |
| Scanner overclaims architecture violations | Advisory findings vs hypotheses; configured boundaries only | Phase 5 |
| Instruction-entry API mismatch | Locked 2.0.26 contract; experimental 2.2.x gated follow-up | Phase 1 decision |
| Announcement churn / noise | Silent default; status command; no synthetic messages | Phase 1 |
| Per-session profiles leak across repos/worktrees | Cache by root + subpath; fallback diagnostic | Phase 1 |
| Metrics expose paths/prompts | Stable reason codes; omit absolute paths in export | Phase 1 |
| Phase 3 depends on scanner not shipped | Deptrac-or-unavailable; scanner adapter deferred to Phase 5 | Phase 3 |
| Drift feedback annoys users | Opt-in/config-gated; no per-edit mandatory output | Phase 6 |
| LLM classifier reduces determinism | Explicit opt-in; deterministic post-validation; fallback | Phase 7 |

## 10. Deferred decisions and explicit constraints

| Item | Decision |
| --- | --- |
| Verification statuses | Adopted; Phase 3 normalizes per-check and aggregate statuses |
| Scanner/verification dependency | Phase 3 uses Deptrac only; Phase 5 scanner adapter |
| Scanner cache | Content hash for files up to 1 MB; larger files explicitly best-effort metadata mode |
| User-facing announcements | Silent by default; status command is diagnostics path |
| Pattern-library scope | Four P0 skills; five P1 candidates; promotion requires evidence |
| `session.instructions.entry` | Latest 2.2.x exposes experimentally; locked 2.0.26 does not; Phase 1 uses context-hook system parts |
| LLM classification | Phase 7 only; deterministic fallback and explicit opt-in |
| TUI notifications | Deferred; no synthetic messages for routing announcements |
| Framework-specific rules | Sibling toolkits only |
| Architecture auto-scan | Opt-in and bounded; default on-demand |
| Architecture drift | Phase 6 P2; never mandatory per edit |

The opencode-php-toolkit must remain **an engineering guidance and verification layer that improves the coding agent's judgment**, not an autonomous architect that controls every action.

## 11. Phase plan authoring checklist

Before creating each phase plan:

- [ ] Read the spec completely.
- [ ] Read the roadmap and previous phase handoff/review.
- [ ] Confirm the locked plugin/API contract; do not assume experimental APIs.
- [ ] Map every spec section for the phase to at least one task.
- [ ] Include failing tests before implementation tasks.
- [ ] Include exact fixture paths and commands.
- [ ] Include dist rebuild, README, CHANGELOG and release packaging.
- [ ] Include acceptance checklist copied from the spec.
- [ ] Include rollback/escape-hatch notes.
- [ ] Self-review for placeholders, type consistency and spec coverage.

## 12. Definition of done for the full specification

The full spec is delivered only when:

- [ ] Phases 1–5 are shipped and pass their exit gates.
- [ ] Phase 6/7 are either shipped or explicitly deferred with rationale.
- [ ] The routing corpus asserts full expected skill sets and passes.
- [ ] Precision and false-positive targets are met on evaluation fixtures.
- [ ] Build/Design/Test tasks receive verification reminders and evaluation shows improved outcomes.
- [ ] Existing skill IDs, tools, commands and agents remain compatible.
- [ ] Documentation explains defaults, opt-outs and permission/side-effect model.
- [ ] CI is green on supported Node versions.
- [ ] Published package passes `npm pack --dry-run` and plugin import smoke test.
- [ ] A final self-review confirms the toolkit improves agent judgment rather than constraining it.

## 13. Maintenance and change control

When a phase changes the design:

1. Update the spec first, or add an ADR when the change is significant.
2. Update this roadmap's phase exit gate and dependency graph.
3. Update the phase plan.
4. Update tests/fixtures.
5. Update README/CHANGELOG before release.

Never patch a phase plan to silently contradict the spec.

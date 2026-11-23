# PHP Architect Workflows and Project-Aware Verification

> Date: 2026-11-23
> Status: Proposed
> Branch: `feat/php-architect-composer-verify` (split from `main`)
> Scope: Finish reactive-engineering phases 4 and 5, and make `php_verify` work with project-defined Composer quality scripts.

## Intent

Help PHP developers make design decisions with the right level of friction, inspect architecture without imposing guessed rules, and verify projects using their existing Composer quality scripts. The work builds on the framework-agnostic toolkit and its existing verification and routing architecture.

## Current state

- Phases 1–3 of the reactive-engineering roadmap are implemented. The roadmap already defines the phase 4 architect surfaces and phase 5 scanner, but those exit gates remain open.
- The toolkit has four specialist agents and a postinstall copier. Phase 4 adds one `php-architect` agent, `/php-design`, and `/php-architect`.
- `php_verify` supports lint, Composer validation, tests, static analysis, style, and architecture. Its adapters select tools from detected dependencies/configuration.
- Project detection already reads Composer scripts, but scripts do not flow into `ProjectProfile` or drive verification. CI conventions are not currently summarized for verification.
- `php-toolkit.json` is already planned as the scanner's optional root config for explicit architecture layers.

## Goals

- Deliver the roadmap's phase 4 design and architect commands, agent, postinstall behavior, and status diagnostics.
- Deliver the phase 5 read-only architecture scanner, explicit boundary validation, and `php_verify` architecture adapter.
- Allow teams to map their Composer quality scripts to verification checks and invoke those mappings through `php_verify`.
- Use CI metadata to discover and explain existing PHP quality conventions without assuming a framework or a CI vendor.
- Keep default verification predictable, bounded, permission-aware, and non-mutating by default.
- Preserve existing tool, command, skill, agent, and config behavior unless explicitly extended here.

## Non-goals

- Framework-specific rules or replacement of the Laravel/Symfony sibling toolkits.
- LLM-based architecture judgments, inferred layer violations, or automatic refactoring.
- Automatically running arbitrary Composer scripts or CI commands during prompt handling.
- Installing dependencies, editing project config, or making CI changes.
- Replacing a project's own test, analyzer, style, or architecture tools.

## Approaches considered

1. **Complete roadmap phases 4 and 5 only.** This is coherent and already specified, but leaves projects whose preferred checks are wrapped in Composer scripts less well served.
2. **Complete phases 4 and 5 and add explicit project-aware verification.** This extends existing surfaces and uses local Composer/CI conventions while keeping custom script execution opt-in. **Selected:** it addresses both requested directions and makes verification useful across more PHP project layouts.
3. **Build a broad CI adapter that executes provider-specific pipeline commands.** This could mirror each project's pipeline more closely, but CI YAML can express arbitrary shell and container behavior, has provider-specific semantics, and would expand execution and permission risks. Keep CI discovery advisory and use explicit Composer mappings for execution.

## Design

### Architect workflows and diagnostics

- Add `agents/php-architect.md` as the sole new specialist agent. It is read-only while preparing a design and waits for approval before implementation.
- Add `/php-design` as the fluid workflow: provide context, forces, options, recommendation, and test plan; proceed for non-significant changes when the user requested implementation.
- Add `/php-architect` as the design-first workflow that always stops for approval.
- Extend the existing postinstall copy to install the agent without overwriting a user's existing file.
- Extend `/php-toolkit-status` with the latest architecture-scan state when present, alongside current verification state.

### Architecture scanner

- Add `scripts/architecture-scan.php`, using PHP's built-in `token_get_all` and no Composer dependency; expose it through `php_architecture_scan`.
- Scan bounded PHP source files and return JSON findings with `kind` (`finding`, `hypothesis`, or `metric`), severity, path, line, evidence, confidence, and any candidate patterns.
- Report structural observations and heuristics as suggestions. Report dependency violations only when valid explicit layers exist in `php-toolkit.json`.
- Validate scanner config. Invalid config disables boundary checks and returns a clear diagnostic; it never guesses layer membership.
- Keep scans read-only, local, capped at 500 files by default, and timed out after 20 seconds. Cache by project/worktree, scanner and toolkit versions, config, Composer lock, and scanned-file fingerprints. Label metadata-only cache entries best-effort.
- Keep `architectureScan: "tool"` on-demand by default; honor `"auto"` and `"off"` as specified in the existing reactive-engineering design.
- Wire the scanner into the existing `php_verify` architecture check when explicit boundaries are configured; preserve Deptrac behavior where it is configured.

### Composer scripts and CI conventions in verification

- Carry Composer script names and normalized script definitions from project detection into the session project profile. Do not include script bodies or CI file contents in prompt context.
- Extend `php-toolkit.json` with an optional `verification.composerScripts` map from supported verification check names (`tests`, `static`, `style`) to existing Composer script names. Validate names and shape; unknown check keys or missing script names produce a config diagnostic.
- When a mapping is configured and that check is requested by `php_verify`, run `composer run-script --no-interaction <name>` through the existing command runner, timeout, abort, and command-permission path. Never invoke mapped scripts automatically from prompt hooks or `php_verify` defaults.
- A mapped script runs as a whole-project check. If the caller requests changed scope, report that the mapped script does not support incremental path selection; do not pass source paths to it. The check succeeds or fails from its process outcome, and output remains bounded.
- If a script is not mapped, keep existing built-in adapters and detection behavior. Show Composer script and CI convention hints as diagnostics only; do not infer and execute commands from CI YAML.
- Detect common CI config locations with bounded, read-only metadata inspection. Report provider/config presence and recognizable PHP version matrix values or known quality-tool names, without preserving or emitting full file content. Unknown providers and constructs remain unparsed.
- Update `php_verify`, project/status diagnostics, README, and config examples to explain mappings and side effects. A mapped Composer script is arbitrary project code: the user must explicitly configure it and request the corresponding check. Apply existing host command permissions and never bypass `ask` or `deny`.

## Constraints and compatibility

- Use the current OpenCode v2 plugin contract and existing `CommandRunner`; do not introduce new dependencies for the scanner or CI discovery.
- Preserve existing tool and command IDs. The new command and tool IDs follow current `php-*` and `php_*` naming.
- Preserve `php_verify` defaults. Custom scripts run only through explicit project mappings and an explicit verification request; CI-derived commands are never executed.
- Keep privacy guarantees: no prompt text, source contents, Composer script bodies, or CI file contents are written to storage or metrics.
- Build and commit `dist/` with source changes as required by this repository.

## Acceptance criteria

- Phase 4 roadmap exit gates pass: agent installation does not overwrite user files; `/php-design` is fluid for small changes; `/php-architect` waits for approval; status reports verification and scan state; no other specialist agent is added.
- Phase 5 exit gates pass: findings and hypotheses are distinguishable; no inferred layer violations; cache invalidation covers project/config/lock/toolkit inputs; scan is read-only and bounded; auto mode remains opt-in.
- A configured Composer script is used only for its explicitly mapped check and only when requested; unmapped scripts and CI commands are never executed.
- Changed-scope reports make clear that mapped scripts run whole-project and do not receive changed source paths.
- Permission denials, approval-required commands, timeouts, aborts, malformed configuration, missing tools, and oversized/truncated scans have explicit report states.
- Existing verification, routing, and package behavior remains compatible.
- Documentation describes configuration, execution side effects, privacy, and escape hatches.

## Calls left to the implementation plan

- Exact supported CI config files and bounded metadata fields.
- Whether to use the planned scanner cache storage interface as-is or introduce a narrower helper.
- Fine-grained report reason codes and metric fields, provided the acceptance criteria above remain intact.

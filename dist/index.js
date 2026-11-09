import { basename, join, resolve } from "node:path";
import { Plugin } from "@opencode/plugin";
import { COMMAND_DEFS, HIDDEN_SKILL_IDS, SKILL_IDS, PKG_ROOT, loadText, parseFrontmatter } from "./content.js";
import { detectPhpProject, formatDetection } from "./tools/detect.js";
import { composerAudit, composerOutdated, composerValidate, phpLint, phpStaticAnalysis, phpTest } from "./tools/php-tools.js";
import { phpVerify } from "./verify/verify.js";
import { VERIFICATION_CHECKS } from "./verify/types.js";
import { MetricsRegistry, resolveProjectScope } from "./metrics/registry.js";
import { formatMetricsSnapshot } from "./metrics/format.js";
import { PHP_TRIGGER, isDestructiveShell } from "./hooks/php-context.js";
import { readToolkitConfig } from "./config.js";
import { ProjectProfileCache } from "./profile.js";
import { runRouting, runRoutingSafely } from "./routing/orchestrator.js";
import { RoutingRenderContexts } from "./routing/state.js";
import { cacheSessionState, loadPersistedSessionState, persistStorageState, pruneStaleRoutingSessions, } from "./routing/persistence.js";
import { applyPermissionsEvent, applySkillActivatedEvent, } from "./routing/events.js";
import { l0Part, removePhpToolkitParts, renderToolkitStatePart, statePart, } from "./context/parts.js";
import { buildCurrentStatusSnapshot } from "./status/toolkit-status.js";
function skillTitle(id) {
    return id
        .split("-")
        .map((w) => (w === "php" ? "PHP" : w[0].toUpperCase() + w.slice(1)))
        .join(" ");
}
export default Plugin.define({
    id: "php-toolkit",
    async setup(ctx) {
        const dir = ctx.location.directory;
        const project = { name: basename(dir) || dir, path: dir };
        const metrics = new MetricsRegistry(ctx.storage, project);
        try {
            await metrics.initActive();
        }
        catch (err) {
            // Metrics are optional: a storage failure must never take the toolkit down.
            console.error(`[php-toolkit] metrics unavailable: ${err.message}`);
        }
        const config = readToolkitConfig(ctx.options);
        const profileCache = new ProjectProfileCache();
        const sessions = new Map();
        const renderContexts = new RoutingRenderContexts();
        const contentLengths = new Map();
        // Skills the host can resolve: bundled files that loaded, plus host skills
        // registered under the same id. Routing must not attach the others.
        const availableSkills = new Set();
        // Best-effort housekeeping for stale routing documents. A failure must
        // not prevent the plugin from starting.
        void pruneStaleRoutingSessions(ctx.storage).catch((err) => {
            console.warn(`[php-toolkit] stale session state prune failed: ${err.message}`);
        });
        const routingStateForEvent = async (sessionID) => {
            // Resolve the session first so even a cached entry can be scoped:
            // routing state is per project, and a stale cache for a moved session
            // must not receive the event.
            let session;
            try {
                session = await ctx.session.get({ sessionID });
            }
            catch (err) {
                console.warn(`[php-toolkit] could not resolve session for routing event: ${err.message}`);
                // The event still belongs to this session. Reuse state that was
                // already scope-validated rather than dropping the activation or
                // permission change entirely.
                const cached = sessions.get(sessionID);
                if (cached) {
                    renderContexts.syncState(sessionID, cached);
                    return cached;
                }
                const hydrated = await loadPersistedSessionState(ctx.storage, sessionID);
                if (hydrated) {
                    cacheSessionState(sessions, hydrated);
                    renderContexts.syncState(sessionID, hydrated);
                }
                return hydrated ?? undefined;
            }
            const root = session?.location?.directory ?? ctx.location.directory;
            const subpath = session?.subpath ?? null;
            const cached = sessions.get(sessionID);
            if (cached) {
                if (cached.projectRoot === root && cached.projectSubpath === subpath) {
                    renderContexts.syncState(sessionID, cached);
                    return cached;
                }
                // Stale scope for this session: drop it and re-hydrate from storage.
                sessions.delete(sessionID);
            }
            const hydrated = await loadPersistedSessionState(ctx.storage, sessionID);
            if (!hydrated || hydrated.projectRoot !== root || hydrated.projectSubpath !== subpath) {
                return undefined;
            }
            cacheSessionState(sessions, hydrated);
            renderContexts.syncState(sessionID, hydrated);
            return hydrated;
        };
        /**
         * Wraps a tool so the metric reflects what the tool actually did.
         *
         * The tool reports its own outcome instead of relying on the framework
         * status: the PHP tools return failures as text (a lint that finds a
         * broken file is a successful lint), so "did it run" and "did it find
         * problems" have to be reported separately.
         *
         * The result is attributed to the directory the tool actually worked in,
         * so work done for another project does not land in this project's
         * snapshot.
         */
        const tracked = (name, run) => {
            return async (input, context) => {
                const requested = input?.directory;
                const target = typeof requested === "string" && requested ? requested : undefined;
                const scope = resolveProjectScope(dir, target);
                const store = metrics.storeFor(scope);
                try {
                    const outcome = await run(input, context);
                    await store.recordTool({ tool: name, status: outcome.status, findings: outcome.findings });
                    return { content: outcome.text };
                }
                catch (err) {
                    await store.recordTool({ tool: name, status: "error", findings: 0 });
                    throw err;
                }
            };
        };
        const registrations = [];
        const track = (r) => {
            registrations.push(r);
            return r;
        };
        // ---- Skills: markdown source-of-truth, registered via transform ----
        try {
            const skills = [];
            for (const id of SKILL_IDS) {
                try {
                    const body = await loadText(`skills/${id}/SKILL.md`);
                    const { front, content } = parseFrontmatter(body);
                    // maxSkillChars is a character budget; byte length would drop
                    // content that fits the configured limit.
                    contentLengths.set(id, [...content].length);
                    availableSkills.add(id);
                    skills.push({
                        id,
                        name: front.name ?? skillTitle(id),
                        description: front.description ?? `${skillTitle(id)} for framework-agnostic PHP 8.1+.`,
                        path: join(PKG_ROOT, "skills", id, "SKILL.md"),
                        content,
                    });
                }
                catch {
                    // missing file — skip, verified at build time
                }
            }
            if (skills.length) {
                track(await ctx.skill.transform((editor) => {
                    for (const id of SKILL_IDS) {
                        if (editor.get(id))
                            availableSkills.add(id);
                    }
                    for (const s of skills) {
                        if (!editor.get(s.id)) {
                            editor.add({ id: s.id, name: s.name, description: s.description, path: s.path, content: s.content, autoinvoke: !HIDDEN_SKILL_IDS.has(s.id) });
                        }
                    }
                }));
            }
        }
        catch (err) {
            console.error(`[php-toolkit] skill registration failed: ${err.message}`);
        }
        // ---- Commands: templates from commands/*.md ----
        try {
            const commands = [];
            for (const def of COMMAND_DEFS) {
                try {
                    const body = await loadText(def.file);
                    const { front, content } = parseFrontmatter(body);
                    commands.push({ name: def.name, description: front.description ?? def.fallback, template: content.trim() });
                }
                catch {
                    commands.push({ name: def.name, description: def.fallback, template: `$ARGUMENTS` });
                }
            }
            track(await ctx.command.transform((editor) => {
                for (const c of commands) {
                    editor.add({
                        name: c.name,
                        description: c.description,
                        execute: async ({ sessionID, prompt, delivery }) => {
                            await metrics.active.recordCommand({ name: c.name });
                            if (c.name === "php-toolkit-status") {
                                const snapshot = await buildCurrentStatusSnapshot(ctx, {
                                    sessionID,
                                    profileCache,
                                    sessions,
                                    renderContexts,
                                    config,
                                    verificationFor: async (root) => {
                                        const store = metrics.storeFor(root);
                                        await store.init().catch(() => { });
                                        return store.getSnapshot().verification;
                                    },
                                });
                                await ctx.session.prompt({
                                    sessionID,
                                    text: c.template.replace("SNAPSHOT_PLACEHOLDER", snapshot),
                                    delivery,
                                    // A diagnostic must not be routed or recorded as a trigger.
                                    metadata: { "php-toolkit-status": true },
                                });
                                return;
                            }
                            const args = prompt.text.trim();
                            const text = c.template.includes("$ARGUMENTS")
                                ? c.template.replaceAll("$ARGUMENTS", args)
                                : args
                                    ? `${c.template}\n\n${args}`
                                    : c.template;
                            await ctx.session.prompt({ sessionID, text, delivery });
                        },
                    });
                }
            }));
        }
        catch (err) {
            console.error(`[php-toolkit] command registration failed: ${err.message}`);
        }
        // ---- Tools (promise flavor: JSON Schema input, Promise executor) ----
        try {
            track(await ctx.tool.transform((editor) => {
                // Read-only unless noted: php_test executes the project's test
                // suite, and php_static_analysis runs the project's analyzer, which
                // may execute project-configured code (bootstrap, plugins).
                editor.namespace({
                    name: "php",
                    description: "Framework-agnostic PHP project tools (read-only unless noted; php_test executes the project's test suite and php_static_analysis runs the project's analyzer, which may execute project code)",
                });
                // Every handler resolves the requested directory once, so execution
                // (child cwd, vendor binaries) and metrics attribution always use
                // the same absolute path, independent of the process working dir.
                const cwdOf = (input) => resolve(dir, input?.directory ?? dir);
                editor.add({
                    name: "project_detect",
                    description: "Detect PHP project intel from composer.json/lock: PHP requirement, PSR-4 roots, PHPUnit/Pest/PHPStan/Psalm/CS-Fixer/Rector presence, analyzer/fixer config files, composer platform.php. No shell exec.",
                    input: { type: "object", properties: { directory: { type: "string" } }, additionalProperties: false },
                    options: { namespace: "php" },
                    execute: tracked("php_project_detect", async (input) => {
                        const info = await detectPhpProject(cwdOf(input));
                        return {
                            text: formatDetection(info),
                            status: "ok",
                            // A malformed manifest is a problem in the project.
                            findings: info.composerJsonError ? 1 : 0,
                        };
                    }),
                });
                editor.add({
                    name: "lint",
                    description: "Run php -l on given PHP files plus composer validate (read-only).",
                    input: {
                        type: "object",
                        properties: {
                            paths: { type: "array", items: { type: "string" } },
                            directory: { type: "string" },
                        },
                        required: ["paths"],
                        additionalProperties: false,
                    },
                    options: { namespace: "php" },
                    execute: tracked("php_lint", async (input, context) => {
                        const cwd = cwdOf(input);
                        const lint = await phpLint(input.paths, cwd, context.signal);
                        const validated = await composerValidate(cwd, context.signal);
                        return {
                            text: `${lint.text}\n\n${validated.text}`.slice(0, 24000),
                            // The tool only failed outright when neither half could run.
                            status: lint.status === "error" && validated.status === "error" ? "error" : "ok",
                            findings: lint.findings + validated.findings,
                        };
                    }),
                });
                editor.add({
                    name: "composer_audit",
                    description: "Run composer audit --format=json (read-only). Reports known vulnerabilities; never runs update.",
                    input: { type: "object", properties: { directory: { type: "string" } }, additionalProperties: false },
                    options: { namespace: "php" },
                    execute: tracked("php_composer_audit", async (input, context) => {
                        const cwd = cwdOf(input);
                        return composerAudit(cwd, context.signal);
                    }),
                });
                editor.add({
                    name: "composer_outdated",
                    description: "Run composer outdated --direct --format=json (read-only; reaches the network - the repositories configured in the project's composer.json determine which hosts are contacted). Lists direct dependencies with a newer version; the count is reported as findings.",
                    input: { type: "object", properties: { directory: { type: "string" } }, additionalProperties: false },
                    options: { namespace: "php" },
                    execute: tracked("php_composer_outdated", async (input, context) => {
                        const cwd = cwdOf(input);
                        return composerOutdated(cwd, context.signal);
                    }),
                });
                editor.add({
                    name: "static_analysis",
                    description: "Run PHPStan (or Psalm when PHPStan is absent) on the project with JSON output. The analyzer binary may execute project-configured code (bootstrap files, autoload, Psalm plugins). Needs the dev dependency installed (vendor/bin). Analysis errors count as findings; a broken analyzer is an error, not a finding. Pass `tool` to force 'phpstan' or 'psalm'.",
                    input: {
                        type: "object",
                        properties: {
                            directory: { type: "string" },
                            tool: { type: "string", enum: ["auto", "phpstan", "psalm"], description: "Force an analyzer. Default: auto (PHPStan first)." },
                        },
                        additionalProperties: false,
                    },
                    options: { namespace: "php" },
                    execute: tracked("php_static_analysis", async (input, context) => {
                        const cwd = cwdOf(input);
                        return phpStaticAnalysis(cwd, context.signal, input.tool ?? "auto");
                    }),
                });
                editor.add({
                    name: "test",
                    description: "Run the project's test suite via vendor/bin/pest or vendor/bin/phpunit and report failures as findings. Executes project code; needs the dev dependencies installed. Failing tests are findings, not tool errors.",
                    input: {
                        type: "object",
                        properties: {
                            directory: { type: "string" },
                            filter: { type: "string", description: "Optional --filter pattern passed to the runner." },
                        },
                        additionalProperties: false,
                    },
                    options: { namespace: "php" },
                    execute: tracked("php_test", async (input, context) => {
                        const cwd = cwdOf(input);
                        return phpTest(cwd, context.signal, input.filter);
                    }),
                });
                editor.add({
                    name: "verify",
                    description: "Run the project's own verification checks and return one report: lint, composer, tests, static analysis, style and architecture. Non-mutating: never installs dependencies, edits configuration or applies fixes; style checks are dry-run. scope=changed uses the host VCS working tree and maps production changes to tests; scope=all runs the full suite/analysis. Respects session command permissions; denied checks are reported as cancelled, never bypassed.",
                    input: {
                        type: "object",
                        properties: {
                            directory: { type: "string" },
                            scope: { type: "string", enum: ["changed", "all"], default: "changed" },
                            checks: {
                                type: "array",
                                items: { type: "string", enum: [...VERIFICATION_CHECKS] },
                            },
                            paths: { type: "array", items: { type: "string" } },
                        },
                        additionalProperties: false,
                    },
                    options: { namespace: "php" },
                    execute: tracked("php_verify", async (input, context) => {
                        let session = null;
                        try {
                            session = await ctx.session.get({ sessionID: context.sessionID });
                        }
                        catch (err) {
                            console.warn(`[php-toolkit] could not resolve the session for php_verify: ${err.message}`);
                        }
                        const sessionRoot = session?.location?.directory ?? dir;
                        const subpath = session?.subpath ?? null;
                        const report = await phpVerify(input, {
                            sessionRoot,
                            profileFor: (root) => profileCache.resolve(root, root === sessionRoot ? subpath : null),
                            vcsStatus: async (directory) => {
                                const status = await ctx.vcs.status({ location: { directory } });
                                return { data: status.data ?? [] };
                            },
                            permissionRules: session?.permissions ?? [],
                            signal: context.signal,
                        });
                        const scope = resolveProjectScope(sessionRoot, input.directory);
                        try {
                            await metrics.storeFor(scope).recordVerification({
                                status: report.status,
                                checks: report.checks,
                                findings: report.findings,
                            });
                        }
                        catch (err) {
                            // Metrics are optional; never fail a verification report over them.
                            console.error(`[php-toolkit] verification metrics failed: ${err.message}`);
                        }
                        // `tracked` records the tool outcome; a completed report is a
                        // successful run even when findings exist.
                        return {
                            text: report.text,
                            status: report.status === "error" ? "error" : "ok",
                            findings: report.findings,
                        };
                    }),
                });
                editor.add({
                    name: "metrics",
                    description: "Show local PHP toolkit usage metrics for this project: tool runs, ok/error outcomes, issues surfaced, command usage, PHP prompt hits. Stored locally; the plugin sends no telemetry. Input: `reset: true` clears this project's metrics (replaces the document with an empty one, no undo); `export: true` returns the snapshot as raw JSON (without reset; with reset, the JSON is followed by the reset confirmation).",
                    input: {
                        type: "object",
                        properties: {
                            allProjects: {
                                type: "boolean",
                                description: "Also show the per-project breakdown across this machine.",
                            },
                            reset: {
                                type: "boolean",
                                description: "Clear this project's metrics and start over (no undo).",
                            },
                            export: {
                                type: "boolean",
                                description: "Return the snapshot as raw JSON instead of the rendered view (without reset; combined with reset, the JSON is followed by the reset confirmation).",
                            },
                        },
                        additionalProperties: false,
                    },
                    options: { namespace: "php" },
                    // Deliberately not tracked: reading the snapshot must not change it.
                    execute: async (input) => {
                        // Write everything this process is holding before reading, so
                        // the machine-wide view is not missing our own pending events.
                        await metrics.flushAll();
                        const all = input?.allProjects;
                        const reset = input?.reset;
                        const exportJson = input?.export;
                        const snapshot = metrics.active.getSnapshot();
                        if (exportJson && !reset) {
                            // Raw JSON, as documented. The absolute project path stays
                            // local: tool output can reach a remote model provider, and
                            // the rendered view promises no absolute paths either.
                            const { projectPath: _local, ...shareable } = snapshot;
                            return { content: JSON.stringify(shareable, null, 2) };
                        }
                        const parts = [];
                        if (exportJson) {
                            // Export reflects the state before any reset is applied.
                            const { projectPath: _local, ...shareable } = snapshot;
                            parts.push(JSON.stringify(shareable, null, 2));
                        }
                        if (reset) {
                            const ok = await metrics.resetActive();
                            parts.push(ok
                                ? "php_metrics: metrics for this project cleared. Tracking starts from zero on the next tool call."
                                : "php_metrics: could not clear the metrics (storage error) - they were left untouched.");
                        }
                        if (parts.length)
                            return { content: parts.join("\n\n") };
                        const scan = all ? await metrics.active.listOtherProjects() : undefined;
                        return { content: formatMetricsSnapshot(snapshot, scan) };
                    },
                });
            }));
        }
        catch (err) {
            console.error(`[php-toolkit] tool registration failed: ${err.message}`);
        }
        // ---- Hooks ----
        try {
            track(await ctx.session.hook("prompt", async (event) => {
                if (event.metadata?.["php-toolkit-status"] === true)
                    return;
                const explicit = event.prompt.skills ?? [];
                const result = await runRoutingSafely(() => runRouting(ctx, {
                    sessionID: event.sessionID,
                    text: event.prompt.text,
                    files: (event.prompt.files ?? []).map((file) => file.name ?? file.uri ?? ""),
                    skills: explicit,
                }, config, profileCache, sessions, contentLengths, availableSkills, renderContexts, metrics), explicit);
                if (result.error) {
                    // Do not let a failed prompt render the previous task's state.
                    renderContexts.clear(event.sessionID);
                    console.error(`[php-toolkit] routing failed: ${result.error}`);
                }
                // Router attachments are plain IDs; the host brand is only a type-level marker.
                event.prompt.skills = [...explicit, ...result.attach];
                if (PHP_TRIGGER.test(event.prompt.text)) {
                    event.metadata = { ...(event.metadata ?? {}), "php-toolkit": true };
                    try {
                        await metrics.active.recordTrigger();
                    }
                    catch (err) {
                        console.error(`[php-toolkit] trigger metrics failed: ${err.message}`);
                    }
                }
            }));
            track(await ctx.session.hook("context", (event) => {
                event.system = removePhpToolkitParts(event.system);
                event.system.push(l0Part());
                const render = renderContexts.get(event.sessionID);
                if (render && render.state.taskGeneration > 0) {
                    try {
                        event.system.push(statePart(renderToolkitStatePart(render, { verification: config.verification })));
                    }
                    catch (err) {
                        console.error(`[php-toolkit] context render failed: ${err.message}`);
                    }
                }
            }));
            track(await ctx.session.hook("compaction", () => { }));
            track(await ctx.session.hook("title", () => { }));
            track(await ctx.session.hook("generate", () => { }));
            track(await ctx.tool.hook("execute.before", (event) => {
                const hit = isDestructiveShell(event.input);
                if (hit) {
                    console.error(`[php-toolkit] caution: destructive pattern (${hit}) in tool "${event.tool}". Prefer dry-run first: rector --dry-run, php-cs-fixer --dry-run, composer update --dry-run equivalent review.`);
                }
            }));
        }
        catch (err) {
            console.error(`[php-toolkit] hook registration failed: ${err.message}`);
        }
        const eventsAbort = new AbortController();
        void (async () => {
            try {
                const stream = await ctx.event.subscribe({ signal: eventsAbort.signal });
                for await (const event of stream) {
                    if (eventsAbort.signal.aborted)
                        break;
                    if (event.type === "session.skill.activated") {
                        const state = await routingStateForEvent(event.data.sessionID);
                        if (state) {
                            applySkillActivatedEvent(state, {
                                sessionID: event.data.sessionID,
                                id: event.data.id,
                            });
                            try {
                                await metrics.recordRouting({ kind: "activated", skill: event.data.id }, state.projectRoot);
                            }
                            catch (err) {
                                console.error(`[php-toolkit] routing metrics failed: ${err.message}`);
                            }
                            try {
                                await persistStorageState(ctx.storage, state);
                            }
                            catch (err) {
                                console.error(`[php-toolkit] routing persistence failed: ${err.message}`);
                            }
                        }
                    }
                    else if (event.type === "session.permissions") {
                        const state = await routingStateForEvent(event.data.sessionID);
                        if (state) {
                            applyPermissionsEvent(state, event.data.permissions);
                            try {
                                await persistStorageState(ctx.storage, state);
                            }
                            catch (err) {
                                console.error(`[php-toolkit] routing persistence failed: ${err.message}`);
                            }
                        }
                    }
                }
            }
            catch (err) {
                if (!eventsAbort.signal.aborted) {
                    console.error(`[php-toolkit] session event subscription failed: ${err.message}`);
                }
            }
        })();
        return async () => {
            eventsAbort.abort();
            await metrics.flushAll();
            renderContexts.clearAll();
            sessions.clear();
            for (const r of registrations.splice(0)) {
                void r.dispose().catch(() => { });
            }
        };
    },
});
//# sourceMappingURL=index.js.map
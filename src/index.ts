import { basename, join, resolve } from "node:path";
import { Plugin } from "@opencode/plugin";
import { COMMAND_DEFS, SKILL_IDS, PKG_ROOT, loadText, parseFrontmatter } from "./content.js";
import { detectPhpProject, formatDetection } from "./tools/detect.js";
import { composerAudit, composerOutdated, composerValidate, phpLint, phpStaticAnalysis, phpTest, type ToolOutcome } from "./tools/php-tools.js";
import { MetricsRegistry, resolveProjectScope } from "./metrics/registry.js";
import type { MetricsProject } from "./metrics/store.js";
import { formatMetricsSnapshot } from "./metrics/format.js";
import { PHP_TRIGGER, isDestructiveShell } from "./hooks/php-context.js";
import { L0_CONSTITUTION } from "./constitution.js";

function skillTitle(id: string): string {
  return id
    .split("-")
    .map((w) => (w === "php" ? "PHP" : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export default Plugin.define({
  id: "php-toolkit",
  async setup(ctx) {
    const dir = ctx.location.directory;
    const project: MetricsProject = { name: basename(dir) || dir, path: dir };
    const metrics = new MetricsRegistry(ctx.storage, project);
    try {
      await metrics.initActive();
    } catch (err) {
      // Metrics are optional: a storage failure must never take the toolkit down.
      console.error(`[php-toolkit] metrics unavailable: ${(err as Error).message}`);
    }

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
    const tracked = <TInput>(
      name: string,
      run: (input: TInput, context: { signal: AbortSignal }) => Promise<ToolOutcome>,
    ) => {
      return async (input: unknown, context: { signal: AbortSignal }) => {
        const requested = (input as { directory?: unknown } | undefined)?.directory;
        const target =
          typeof requested === "string" && requested ? requested : undefined;
        const scope = resolveProjectScope(dir, target);
        const store = metrics.storeFor(scope);
        try {
          const outcome = await run(input as TInput, context);
          await store.recordTool({ tool: name, status: outcome.status, findings: outcome.findings });
          return { content: outcome.text };
        } catch (err) {
          await store.recordTool({ tool: name, status: "error", findings: 0 });
          throw err;
        }
      };
    };

    const registrations: Array<{ dispose: () => Promise<void> }> = [];
    const track = <T extends { dispose: () => Promise<void> }>(r: T): T => {
      registrations.push(r);
      return r;
    };

    // ---- Skills: markdown source-of-truth, registered via transform ----
    try {
      const skills: Array<{ id: string; name: string; description: string; path: string; content: string }> = [];
      for (const id of SKILL_IDS) {
        try {
          const body = await loadText(`skills/${id}/SKILL.md`);
          const { front, content } = parseFrontmatter(body);
          skills.push({
            id,
            name: front.name ?? skillTitle(id),
            description: front.description ?? `${skillTitle(id)} for framework-agnostic PHP 8.1+.`,
            path: join(PKG_ROOT, "skills", id, "SKILL.md"),
            content,
          });
        } catch {
          // missing file — skip, verified at build time
        }
      }
      if (skills.length) {
        track(
          await ctx.skill.transform((editor) => {
            for (const s of skills) {
              if (!editor.get(s.id)) {
                editor.add({ id: s.id as never, name: s.name as never, description: s.description, path: s.path as never, content: s.content, autoinvoke: true });
              }
            }
          }),
        );
      }
    } catch (err) {
      console.error(`[php-toolkit] skill registration failed: ${(err as Error).message}`);
    }

    // ---- Commands: templates from commands/*.md ----
    try {
      const commands: Array<{ name: string; description: string; template: string }> = [];
      for (const def of COMMAND_DEFS) {
        try {
          const body = await loadText(def.file);
          const { front, content } = parseFrontmatter(body);
          commands.push({ name: def.name, description: front.description ?? def.fallback, template: content.trim() });
        } catch {
          commands.push({ name: def.name, description: def.fallback, template: `$ARGUMENTS` });
        }
      }
      track(
        await ctx.command.transform((editor) => {
          for (const c of commands) {
            editor.add({
              name: c.name,
              description: c.description,
              execute: async ({ sessionID, prompt, delivery }) => {
                await metrics.active.recordCommand({ name: c.name });
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
        }),
      );
    } catch (err) {
      console.error(`[php-toolkit] command registration failed: ${(err as Error).message}`);
    }

    // ---- Tools (promise flavor: JSON Schema input, Promise executor) ----
    try {
      track(
        await ctx.tool.transform((editor) => {
          // Read-only unless noted: php_test executes the project's test
          // suite, and php_static_analysis runs the project's analyzer, which
          // may execute project-configured code (bootstrap, plugins).
          editor.namespace({
            name: "php",
            description:
              "Framework-agnostic PHP project tools (read-only unless noted; php_test executes the project's test suite and php_static_analysis runs the project's analyzer, which may execute project code)",
          });
          // Every handler resolves the requested directory once, so execution
          // (child cwd, vendor binaries) and metrics attribution always use
          // the same absolute path, independent of the process working dir.
          const cwdOf = (input: { directory?: string } | undefined): string => resolve(dir, input?.directory ?? dir);
          editor.add({
            name: "project_detect",
            description: "Detect PHP project intel from composer.json/lock: PHP requirement, PSR-4 roots, PHPUnit/Pest/PHPStan/Psalm/CS-Fixer/Rector presence, analyzer/fixer config files, composer platform.php. No shell exec.",
            input: { type: "object", properties: { directory: { type: "string" } }, additionalProperties: false },
            options: { namespace: "php" },
            execute: tracked("php_project_detect", async (input: { directory?: string }) => {
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
            execute: tracked("php_lint", async (input: { paths: string[]; directory?: string }, context) => {
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
            execute: tracked("php_composer_audit", async (input: { directory?: string }, context) => {
              const cwd = cwdOf(input);
              return composerAudit(cwd, context.signal);
            }),
          });
          editor.add({
            name: "composer_outdated",
            description:
              "Run composer outdated --direct --format=json (read-only; reaches the network - the repositories configured in the project's composer.json determine which hosts are contacted). Lists direct dependencies with a newer version; the count is reported as findings.",
            input: { type: "object", properties: { directory: { type: "string" } }, additionalProperties: false },
            options: { namespace: "php" },
            execute: tracked("php_composer_outdated", async (input: { directory?: string }, context) => {
              const cwd = cwdOf(input);
              return composerOutdated(cwd, context.signal);
            }),
          });
          editor.add({
            name: "static_analysis",
            description:
              "Run PHPStan (or Psalm when PHPStan is absent) on the project with JSON output. The analyzer binary may execute project-configured code (bootstrap files, autoload, Psalm plugins). Needs the dev dependency installed (vendor/bin). Analysis errors count as findings; a broken analyzer is an error, not a finding. Pass `tool` to force 'phpstan' or 'psalm'.",
            input: {
              type: "object",
              properties: {
                directory: { type: "string" },
                tool: { type: "string", enum: ["auto", "phpstan", "psalm"], description: "Force an analyzer. Default: auto (PHPStan first)." },
              },
              additionalProperties: false,
            },
            options: { namespace: "php" },
            execute: tracked("php_static_analysis", async (input: { directory?: string; tool?: "auto" | "phpstan" | "psalm" }, context) => {
              const cwd = cwdOf(input);
              return phpStaticAnalysis(cwd, context.signal, input.tool ?? "auto");
            }),
          });
          editor.add({
            name: "test",
            description:
              "Run the project's test suite via vendor/bin/pest or vendor/bin/phpunit and report failures as findings. Executes project code; needs the dev dependencies installed. Failing tests are findings, not tool errors.",
            input: {
              type: "object",
              properties: {
                directory: { type: "string" },
                filter: { type: "string", description: "Optional --filter pattern passed to the runner." },
              },
              additionalProperties: false,
            },
            options: { namespace: "php" },
            execute: tracked("php_test", async (input: { directory?: string; filter?: string }, context) => {
              const cwd = cwdOf(input);
              return phpTest(cwd, context.signal, input.filter);
            }),
          });
          editor.add({
            name: "metrics",
            description:
              "Show local PHP toolkit usage metrics for this project: tool runs, ok/error outcomes, issues surfaced, command usage, PHP prompt hits. Stored locally; the plugin sends no telemetry. Input: `reset: true` clears this project's metrics (replaces the document with an empty one, no undo); `export: true` returns the snapshot as raw JSON (without reset; with reset, the JSON is followed by the reset confirmation).",
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
              const all = (input as { allProjects?: boolean } | undefined)?.allProjects;
              const reset = (input as { reset?: boolean } | undefined)?.reset;
              const exportJson = (input as { export?: boolean } | undefined)?.export;
              const snapshot = metrics.active.getSnapshot();
              if (exportJson && !reset) {
                // Raw JSON, as documented. The absolute project path stays
                // local: tool output can reach a remote model provider, and
                // the rendered view promises no absolute paths either.
                const { projectPath: _local, ...shareable } = snapshot;
                return { content: JSON.stringify(shareable, null, 2) };
              }
              const parts: string[] = [];
              if (exportJson) {
                // Export reflects the state before any reset is applied.
                const { projectPath: _local, ...shareable } = snapshot;
                parts.push(JSON.stringify(shareable, null, 2));
              }
              if (reset) {
                const ok = await metrics.resetActive();
                parts.push(
                  ok
                    ? "php_metrics: metrics for this project cleared. Tracking starts from zero on the next tool call."
                    : "php_metrics: could not clear the metrics (storage error) - they were left untouched.",
                );
              }
              if (parts.length) return { content: parts.join("\n\n") };
              const scan = all ? await metrics.active.listOtherProjects() : undefined;
              return { content: formatMetricsSnapshot(snapshot, scan) };
            },
          });
        }),
      );
    } catch (err) {
      console.error(`[php-toolkit] tool registration failed: ${(err as Error).message}`);
    }

    // ---- Hooks ----
    try {
      track(
        await ctx.session.hook("prompt", async (event) => {
          try {
            if (PHP_TRIGGER.test(event.prompt.text)) {
              event.metadata = { ...(event.metadata ?? {}), "php-toolkit": true };
              await metrics.active.recordTrigger();
            }
          } catch {
            // never break admission
          }
        }),
      );
      track(
        await ctx.session.hook("context", (event) => {
          event.system.push({ type: "text", text: L0_CONSTITUTION });
        }),
      );
      track(
        await ctx.tool.hook("execute.before", (event) => {
          const hit = isDestructiveShell((event as { input?: unknown }).input);
          if (hit) {
            console.error(
              `[php-toolkit] caution: destructive pattern (${hit}) in tool "${(event as { tool?: string }).tool}". Prefer dry-run first: rector --dry-run, php-cs-fixer --dry-run, composer update --dry-run equivalent review.`,
            );
          }
        }),
      );
    } catch (err) {
      console.error(`[php-toolkit] hook registration failed: ${(err as Error).message}`);
    }

    return async () => {
      await metrics.flushAll();
      for (const r of registrations.splice(0)) {
        void r.dispose().catch(() => {});
      }
    };
  },
});

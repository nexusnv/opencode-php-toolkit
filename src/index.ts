import { basename } from "node:path";
import { Plugin } from "@opencode/plugin";
import { COMMAND_DEFS, SKILL_IDS, loadText, parseFrontmatter } from "./content.js";
import { detectPhpProject, formatDetection } from "./tools/detect.js";
import { composerAudit, composerValidate, phpLint, type ToolOutcome } from "./tools/php-tools.js";
import { MetricsStore, type MetricsProject } from "./metrics/store.js";
import { formatMetricsSnapshot } from "./metrics/format.js";
import { PHP_SYSTEM_HINT, PHP_TRIGGER, isDestructiveShell } from "./hooks/php-context.js";

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
    const metrics = new MetricsStore(ctx.storage, project);
    try {
      await metrics.init();
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
     */
    const tracked = <TInput>(
      name: string,
      run: (input: TInput, context: { signal: AbortSignal }) => Promise<ToolOutcome>,
    ) => {
      return async (input: unknown, context: { signal: AbortSignal }) => {
        try {
          const outcome = await run(input as TInput, context);
          await metrics.recordTool({ tool: name, status: outcome.status, findings: outcome.findings });
          return { content: outcome.text };
        } catch (err) {
          await metrics.recordTool({ tool: name, status: "error", findings: 0 });
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
            path: `${dir}/skills/${id}/SKILL.md`,
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
                editor.add({ id: s.id as never, name: s.name as never, description: s.description, path: s.path as never, content: s.content });
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
                await metrics.recordCommand({ name: c.name });
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
          editor.namespace({ name: "php", description: "Framework-agnostic PHP project tools (read-only by default)" });
          editor.add({
            name: "project_detect",
            description: "Detect PHP project intel from composer.json/lock: PHP requirement, PSR-4 roots, PHPUnit/Pest/PHPStan/Psalm/CS-Fixer/Rector presence. No shell exec.",
            input: { type: "object", properties: { directory: { type: "string" } }, additionalProperties: false },
            options: { namespace: "php" },
            execute: tracked("php_project_detect", async (input: { directory?: string }) => ({
              text: formatDetection(await detectPhpProject(input.directory ?? dir)),
              status: "ok",
              findings: 0,
            })),
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
              const cwd = input.directory ?? dir;
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
              const cwd = input.directory ?? dir;
              return composerAudit(cwd, context.signal);
            }),
          });
          editor.add({
            name: "metrics",
            description:
              "Show local PHP toolkit usage metrics for this project: tool runs, ok/error outcomes, issues surfaced, command usage, PHP prompt hits. Local-only data, never leaves the machine.",
            input: {
              type: "object",
              properties: {
                allProjects: {
                  type: "boolean",
                  description: "Also show the per-project breakdown across this machine.",
                },
              },
              additionalProperties: false,
            },
            options: { namespace: "php" },
            // Deliberately not tracked: reading the snapshot must not change it.
            execute: async (input) => {
              await metrics.flush();
              const snapshot = metrics.getSnapshot();
              const all = (input as { allProjects?: boolean } | undefined)?.allProjects;
              const others = all ? await metrics.listOtherProjects() : undefined;
              return { content: formatMetricsSnapshot(snapshot, others) };
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
              await metrics.recordTrigger();
            }
          } catch {
            // never break admission
          }
        }),
      );
      track(
        await ctx.session.hook("context", (event) => {
          event.system.push({ type: "text", text: PHP_SYSTEM_HINT });
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
      await metrics.flush().catch(() => {});
      for (const r of registrations.splice(0)) {
        void r.dispose().catch(() => {});
      }
    };
  },
});

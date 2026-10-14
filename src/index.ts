import { Plugin } from "@opencode/plugin";
import { COMMAND_DEFS, SKILL_IDS, loadText, parseFrontmatter } from "./content.js";
import { detectPhpProject, formatDetection } from "./tools/detect.js";
import { composerAudit, composerValidate, phpLint } from "./tools/php-tools.js";
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
            execute: async (input) => {
              const target = (input as { directory?: string }).directory ?? dir;
              const info = await detectPhpProject(target);
              return { content: formatDetection(info) };
            },
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
            execute: async (input, context) => {
              const { paths, directory } = input as { paths: string[]; directory?: string };
              const cwd = directory ?? dir;
              const lint = await phpLint(paths, cwd, context.signal);
              const validated = await composerValidate(cwd, context.signal);
              return { content: `${lint}\n\n${validated}`.slice(0, 24000) };
            },
          });
          editor.add({
            name: "composer_audit",
            description: "Run composer audit --format=json (read-only). Reports known vulnerabilities; never runs update.",
            input: { type: "object", properties: { directory: { type: "string" } }, additionalProperties: false },
            options: { namespace: "php" },
            execute: async (input, context) => {
              const cwd = (input as { directory?: string }).directory ?? dir;
              return { content: await composerAudit(cwd, context.signal) };
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
        await ctx.session.hook("prompt", (event) => {
          try {
            if (PHP_TRIGGER.test(event.prompt.text)) {
              event.metadata = { ...(event.metadata ?? {}), "php-toolkit": true };
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

    return () => {
      for (const r of registrations.splice(0)) {
        void r.dispose().catch(() => {});
      }
    };
  },
});

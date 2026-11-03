// Copies the php-* agents into the user's global OpenCode config as a
// convenience, because OpenCode v2 agent transforms cannot register new
// agents (AgentEditor has no `add`) — files are the source of truth.
//
// Skips silently when PHP_TOOLKIT_SKIP_AGENT_COPY=1 is set; the rest of the
// plugin works identically either way. The four php-*.md files can be
// removed from ~/.config/opencode/agents/ at any time without breaking
// anything else.
import { cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

if (process.env.PHP_TOOLKIT_SKIP_AGENT_COPY === "1") {
  console.log("php-toolkit: PHP_TOOLKIT_SKIP_AGENT_COPY=1 — skipping agent copy into ~/.config/opencode/agents");
  process.exit(0);
}

const agentsDir = join(homedir(), ".config", "opencode", "agents");

const files = [
  "agents/php-reviewer.md",
  "agents/php-debugger.md",
  "agents/php-modernizer.md",
  "agents/php-tester.md",
];

try {
  const root = new URL(".", import.meta.url).pathname;
  await mkdir(agentsDir, { recursive: true });
  for (const src of files) {
    const dest = src.slice("agents/".length);
    try {
      await cp(join(root, src), join(agentsDir, dest));
      console.log(`php-toolkit: copied ${src} -> ${agentsDir}/${dest}`);
    } catch (e) {
      console.error(`php-toolkit: skip ${src}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
} catch (e) {
  console.error(`php-toolkit postinstall: ${e instanceof Error ? e.message : String(e)}`);
}

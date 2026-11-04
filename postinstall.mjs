// Copies the php-* agents into the user's global OpenCode config as a
// convenience, because OpenCode v2 agent transforms cannot register new
// agents (AgentEditor has no `add`) — files are the source of truth.
//
// Never overwrites: a destination that already exists is left untouched, so
// a user who customized ~/.config/opencode/agents/php-*.md keeps their
// version across installs and upgrades. Delete the file to get the bundled
// version back on the next install.
//
// Skips entirely when PHP_TOOLKIT_SKIP_AGENT_COPY=1 is set; the rest of the
// plugin works identically either way. The four php-*.md files can be
// removed from ~/.config/opencode/agents/ at any time without breaking
// anything else.
import { access, cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

try {
  // fileURLToPath, not URL.pathname: pathname keeps percent-encoding (spaces
  // in install paths) and is not a valid path on Windows.
  const root = fileURLToPath(new URL(".", import.meta.url));
  await mkdir(agentsDir, { recursive: true });
  for (const src of files) {
    const dest = join(agentsDir, src.slice("agents/".length));
    try {
      if (await exists(dest)) {
        console.log(`php-toolkit: kept existing ${dest} (delete it to restore the bundled version)`);
        continue;
      }
      await cp(join(root, src), dest);
      console.log(`php-toolkit: copied ${src} -> ${dest}`);
    } catch (e) {
      console.error(`php-toolkit: skip ${src}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
} catch (e) {
  console.error(`php-toolkit postinstall: ${e instanceof Error ? e.message : String(e)}`);
}

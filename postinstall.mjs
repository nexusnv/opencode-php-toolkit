import { cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const targets = [
  join(homedir(), ".config", "opencode", "agents"),
  join(homedir(), ".config", "opencode", "commands"),
];

const files = [
  ["agents/php-reviewer.md", "php-reviewer.md"],
  ["agents/php-debugger.md", "php-debugger.md"],
  ["agents/php-modernizer.md", "php-modernizer.md"],
  ["agents/php-tester.md", "php-tester.md"],
];

try {
  const root = new URL(".", import.meta.url).pathname;
  for (const dir of targets) await mkdir(dir, { recursive: true });
  for (const [src, dest] of files) {
    const isAgent = src.startsWith("agents/");
    const outDir = isAgent ? targets[0] : targets[1];
    try {
      await cp(join(root, src), join(outDir, dest));
      console.log(`php-toolkit: copied ${src} -> ${outDir}/${dest}`);
    } catch (e) {
      console.error(`php-toolkit: skip ${src}: ${(e as Error).message}`);
    }
  }
} catch (e) {
  console.error(`php-toolkit postinstall: ${(e as Error).message}`);
}

import { execFileSync } from "node:child_process";
import { accessSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const postinstall = fileURLToPath(new URL("../postinstall.mjs", import.meta.url));
const sourceAgent = fileURLToPath(new URL("../agents/php-architect.md", import.meta.url));
const homes: string[] = [];

function temporaryHome(): string {
  const home = mkdtempSync(join(tmpdir(), "php-toolkit-postinstall-"));
  homes.push(home);
  return home;
}

function runPostinstall(home: string, skip = false): void {
  execFileSync(process.execPath, [postinstall], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      HOME: home,
      PHP_TOOLKIT_SKIP_AGENT_COPY: skip ? "1" : "",
    },
  });
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("postinstall agent copy", () => {
  it("copies the bundled php-architect agent into an empty OpenCode home", () => {
    const home = temporaryHome();
    runPostinstall(home);

    const installed = join(home, ".config", "opencode", "agents", "php-architect.md");
    expect(readFileSync(installed, "utf8")).toBe(readFileSync(sourceAgent, "utf8"));
  });

  it("keeps a customized php-architect agent unchanged", () => {
    const home = temporaryHome();
    const agentsDir = join(home, ".config", "opencode", "agents");
    const installed = join(agentsDir, "php-architect.md");
    const customContent = "custom architect instructions\n";
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(installed, customContent);

    runPostinstall(home);

    expect(readFileSync(installed, "utf8")).toBe(customContent);
  });

  it("does not create the global agents directory when copying is disabled", () => {
    const home = temporaryHome();
    runPostinstall(home, true);

    const agentsDir = join(home, ".config", "opencode", "agents");
    expect(() => accessSync(agentsDir)).toThrow();
  });
});

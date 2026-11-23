import { describe, expect, it } from "vitest";
import { commandRules, evaluateCommand } from "../src/verify/permissions.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectProfile } from "../src/profile.js";
import type { VerifyDependencies } from "../src/verify/verify.js";
import { phpVerify } from "../src/verify/verify.js";
import type { CommandRunner, RunResult } from "../src/tools/runner.js";

const rule = (action: string, resource: string, effect: string) => ({ action, resource, effect });

describe("evaluateCommand", () => {
  it("reports tool-level-only when the host exposes no command rules", () => {
    expect(evaluateCommand([rule("skill", "php-*", "deny")], "php", ["-l", "a.php"], "/repo")).toEqual({
      decision: "tool-level-only",
    });
  });

  it("allows a matching allow rule", () => {
    const rules = [rule("bash", "php*", "allow")];
    expect(evaluateCommand(rules, "php", ["-l", "a.php"], "/repo").decision).toBe("allow");
  });

  it("denies a matching deny rule", () => {
    const rules = [rule("bash", "vendor/bin/phpunit*", "deny")];
    expect(
      evaluateCommand(rules, "/repo/vendor/bin/phpunit", ["--log-junit", "php://stdout"], "/repo").decision,
    ).toBe("deny");
  });

  it("requires approval for ask", () => {
    const rules = [rule("shell", "composer *", "ask")];
    expect(evaluateCommand(rules, "composer", ["validate"], "/repo").decision).toBe("approval-required");
  });

  it("uses the last matching rule", () => {
    const rules = [
      rule("bash", "php*", "allow"),
      rule("bash", "php -l *", "deny"),
    ];
    expect(evaluateCommand(rules, "php", ["-l", "a.php"], "/repo").decision).toBe("deny");
  });

  it("matches relative vendor binary candidates", () => {
    const rules = [rule("bash", "vendor/bin/phpstan*", "allow")];
    expect(
      evaluateCommand(rules, "/repo/vendor/bin/phpstan", ["analyse"], "/repo").decision,
    ).toBe("allow");
  });

  it("matches vendor basenames with their arguments", () => {
    const deny = [rule("bash", "phpunit *", "deny")];
    expect(
      evaluateCommand(deny, "/repo/vendor/bin/phpunit", ["--log-junit", "php://stdout"], "/repo").decision,
    ).toBe("deny");
    const ask = [rule("bash", "phpstan analyse *", "ask")];
    expect(
      evaluateCommand(ask, "/repo/vendor/bin/phpstan", ["analyse", "src"], "/repo").decision,
    ).toBe("approval-required");
  });
});

describe("commandRules", () => {
  it("keeps only bash/shell rules", () => {
    const rules = [rule("bash", "*", "allow"), rule("skill", "*", "allow"), rule("shel?", "*", "ask")];
    expect(commandRules(rules)).toHaveLength(2);
  });
});

describe("mapped Composer script permissions", () => {
  it.each(["deny", "ask"] as const)("does not spawn a script when permission is %s", async (effect) => {
    const root = mkdtempSync(join(tmpdir(), "php-toolkit-permission-"));
    writeFileSync(join(root, "composer.json"), "{}");
    const profile = {
      root,
      hasComposerJson: true,
      hasComposerLock: false,
      tools: { phpunit: true, pest: false, phpstan: false, psalm: false, csFixer: false, phpcs: false, rector: false, deptrac: false, infection: false },
      configFiles: { phpunit: "phpunit.xml", pest: null, phpstan: null, psalm: null, phpcs: null, csFixer: null, deptrac: null, architecture: null },
      layout: { sourceRoots: ["src"], testRoots: ["tests"] },
      toolkitConfig: { config: { verification: { composerScripts: { tests: "ci-test" } } } },
    } as unknown as ProjectProfile;
    let spawned = false;
    const runner: CommandRunner = {
      run: async (): Promise<RunResult> => {
        spawned = true;
        return { ok: true, stdout: "", stderr: "", code: 0, killed: false, aborted: false };
      },
    };
    const deps: VerifyDependencies = {
      sessionRoot: root,
      profileFor: async () => profile,
      vcsStatus: async () => ({ data: [] }),
      permissionRules: [rule("bash", "composer *", effect)],
      signal: new AbortController().signal,
      runner,
    };

    const report = await phpVerify({ scope: "all", checks: ["tests"] }, deps);

    expect(spawned).toBe(false);
    expect(report.checks[0]?.status).toBe("cancelled");
    expect(report.checks[0]?.reason).toMatch(effect === "ask" ? /approval/ : /denied/);
  });
});

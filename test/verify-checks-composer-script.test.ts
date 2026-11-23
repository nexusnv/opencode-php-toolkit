import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import { buildProjectProfile } from "../src/profile.js";
import type { CommandRunner, RunResult } from "../src/tools/runner.js";
import { phpVerify, type VerifyDependencies } from "../src/verify/verify.js";

const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-composer-script-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "composer.json"), "{}");
  writeFileSync(join(root, "src/A.php"), "<?php\n");
  return root;
};

const makeProfile = (root: string): ProjectProfile =>
  ({
    root,
    hasComposerJson: true,
    hasComposerLock: false,
    tools: { phpunit: true, pest: false, phpstan: false, psalm: false, csFixer: false, phpcs: false, rector: false, deptrac: false, infection: false },
    configFiles: { phpunit: "phpunit.xml", pest: null, phpstan: null, psalm: null, phpcs: null, csFixer: null, deptrac: null, architecture: null },
    layout: { sourceRoots: ["src"], testRoots: ["tests"] },
    toolkitConfig: { config: { verification: { composerScripts: { tests: "ci-test" } } } },
  }) as unknown as ProjectProfile;

function makeDeps(root: string, run: CommandRunner["run"]): VerifyDependencies {
  return {
    sessionRoot: root,
    profileFor: async () => makeProfile(root),
    vcsStatus: async () => ({ data: [{ file: "src/A.php", status: "modified" }] }),
    signal: new AbortController().signal,
    permissionRules: [],
    runner: { run },
  };
}

const result = (overrides: Partial<RunResult> = {}): RunResult => ({
  ok: true,
  stdout: "",
  stderr: "",
  code: 0,
  killed: false,
  aborted: false,
  ...overrides,
});

describe("explicit Composer verification scripts", () => {
  it("runs the mapped script from the project root without changed paths", async () => {
    const root = makeRoot();
    const calls: Array<{ cmd: string; args: readonly string[]; cwd: string }> = [];
    const report = await phpVerify(
      { scope: "changed", checks: ["tests"] },
      makeDeps(root, async (cmd, args, cwd) => {
        calls.push({ cmd, args, cwd });
        return result();
      }),
    );

    expect(calls).toEqual([{ cmd: "composer", args: ["run-script", "--no-interaction", "ci-test"], cwd: root }]);
    expect(report.checks[0]?.status).toBe("passed");
    expect(report.checks[0]?.summary).toContain("whole-project");
    expect(report.text).toContain("whole-project");
  });

  it("does not run mapped scripts when checks were omitted", async () => {
    const root = makeRoot();
    const calls: string[][] = [];
    await phpVerify(
      { scope: "all" },
      makeDeps(root, async (cmd, args) => {
        calls.push([cmd, ...args]);
        return result({ code: "ENOENT", ok: false });
      }),
    );
    expect(calls.some((args) => args[0] === "composer" && args[1] === "run-script")).toBe(false);
  });

  it("reports script failures without counting them as findings", async () => {
    const root = makeRoot();
    const report = await phpVerify(
      { scope: "all", checks: ["tests"] },
      makeDeps(root, async () => result({ ok: false, code: 2, stderr: "failed\n" })),
    );
    expect(report.checks[0]).toMatchObject({ status: "failed", findings: 0 });
    expect(report.text).toContain("failed");
  });

  it("bounds script output included in the report", async () => {
    const root = makeRoot();
    const report = await phpVerify(
      { scope: "all", checks: ["tests"] },
      makeDeps(root, async () => result({ ok: false, code: 2, stderr: "x".repeat(20_000) })),
    );
    expect(report.text.length).toBeLessThan(10_000);
  });

  it("reports a missing Composer binary as unavailable", async () => {
    const root = makeRoot();
    const report = await phpVerify(
      { scope: "all", checks: ["tests"] },
      makeDeps(root, async () => result({ ok: false, code: "ENOENT", stderr: "not found" })),
    );
    expect(report.checks[0]).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("reports timeout and abort outcomes without counting findings", async () => {
    const root = makeRoot();
    const timeout = await phpVerify(
      { scope: "all", checks: ["tests"] },
      makeDeps(root, async () => result({ ok: false, killed: true })),
    );
    expect(timeout.checks[0]).toMatchObject({ status: "timed_out", findings: 0 });

    const aborted = await phpVerify(
      { scope: "all", checks: ["tests"] },
      makeDeps(root, async () => result({ ok: false, killed: true, aborted: true })),
    );
    expect(aborted.checks[0]).toMatchObject({ status: "cancelled", reason: "aborted", findings: 0 });
  });

  it.each([
    ["unsupported check key", { composerScripts: { test: "ci-test" } }, JSON.stringify({ scripts: { "ci-test": "vendor/bin/phpunit" } })],
    ["absent script name", { composerScripts: { tests: "missing" } }, JSON.stringify({ scripts: { "ci-test": "vendor/bin/phpunit" } })],
    ["malformed mapping", { composerScripts: "ci-test" }, JSON.stringify({ scripts: { "ci-test": "vendor/bin/phpunit" } })],
    ["malformed Composer manifest", { composerScripts: { tests: "ci-test" } }, "{"],
  ] as const)("never executes a mapped script for %s", async (_name, mapping, composerJson) => {
    const root = makeRoot();
    writeFileSync(join(root, "composer.json"), composerJson);
    writeFileSync(join(root, "php-toolkit.json"), JSON.stringify({ verification: mapping }));
    const calls: string[] = [];
    const report = await phpVerify(
      { scope: "all", checks: ["tests"] },
      {
        ...makeDeps(root, async (cmd) => {
          calls.push(cmd);
          return result({ ok: false, code: "ENOENT" });
        }),
        profileFor: () => buildProjectProfile(root, null),
      },
    );
    expect(calls.some((cmd) => cmd === "composer")).toBe(false);
    expect(report.checks[0]?.status).not.toBe("passed");
  });
});

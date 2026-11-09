import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import type { CommandRunner, RunResult } from "../src/tools/runner.js";
import { phpVerify, type VerifyDependencies } from "../src/verify/verify.js";

type Script = (cmd: string, args: readonly string[]) => Partial<RunResult>;

function runner(script: Script): CommandRunner {
  return {
    run: async (cmd, args) => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      killed: false,
      aborted: false,
      ...script(cmd, args),
    }),
  };
}

function project(files: string[], binaries: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-verify-"));
  for (const file of [...files, ...binaries]) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.startsWith("vendor/bin/") ? "#!/bin/sh\n" : "<?php", {
      mode: file.startsWith("vendor/bin/") ? 0o755 : undefined,
    });
    if (file.startsWith("vendor/bin/")) chmodSync(full, 0o755);
  }
  return root;
}

function profile(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    hasComposerJson: true,
    tools: {
      phpunit: true,
      pest: false,
      phpstan: true,
      psalm: false,
      csFixer: true,
      phpcs: false,
      deptrac: false,
    },
    configFiles: {
      phpunit: "phpunit.xml",
      pest: null,
      phpstan: "phpstan.neon",
      psalm: null,
      phpcs: null,
      csFixer: null,
      deptrac: null,
      architecture: null,
    },
    layout: { sourceRoots: ["src"], testRoots: ["tests"] },
    ...overrides,
  } as unknown as ProjectProfile;
}

const JUNIT_CLEAN =
  '<testsuites><testsuite tests="2" assertions="3" failures="0" errors="0" skipped="0"></testsuite></testsuites>';

function defaultScript(cmd: string): Partial<RunResult> {
  if (cmd === "php") return { stdout: "No syntax errors detected" };
  if (cmd === "composer") return { stdout: "valid" };
  if (cmd.endsWith("phpunit")) return { stdout: JUNIT_CLEAN };
  return {};
}

function deps(root: string, overrides: Partial<VerifyDependencies> = {}): VerifyDependencies {
  return {
    sessionRoot: root,
    profileFor: async () => profile(),
    vcsStatus: async () => ({ data: [{ file: "src/A.php", status: "modified" }] }),
    permissionRules: [],
    signal: new AbortController().signal,
    runner: runner(defaultScript),
    ...overrides,
  };
}

describe("phpVerify", () => {
  it("runs all detected checks in the fixed order for scope all", async () => {
    const root = project(
      ["src/A.php", "tests/ATest.php", "composer.json"],
      ["vendor/bin/phpunit", "vendor/bin/phpstan", "vendor/bin/php-cs-fixer", "vendor/bin/deptrac"],
    );
    const report = await phpVerify(
      { scope: "all" },
      deps(root, {
        profileFor: async () =>
          profile({
            tools: { ...profile().tools, deptrac: true },
            configFiles: { ...profile().configFiles, deptrac: "deptrac.yaml" },
          }),
        runner: runner((cmd) => (cmd.endsWith("deptrac") ? {} : defaultScript(cmd))),
      }),
    );
    expect(report.status).toBe("passed");
    expect(report.checks.map((check) => check.check)).toEqual([
      "lint",
      "composer",
      "tests",
      "static",
      "style",
      "architecture",
    ]);
  });

  it("skips changed-file checks when the VCS reports no changes", async () => {
    const root = project(["src/A.php", "composer.json"], ["vendor/bin/phpunit", "vendor/bin/phpstan"]);
    const report = await phpVerify(
      { scope: "changed" },
      deps(root, { vcsStatus: async () => ({ data: [] }) }),
    );
    expect(report.status).toBe("partial");
    expect(report.checks.find((check) => check.check === "composer")?.status).toBe("passed");
    for (const check of report.checks.filter((row) => row.check !== "composer")) {
      expect(check).toMatchObject({ status: "skipped", reason: "no-changed-files" });
    }
  });

  it("never passes when the changed scope cannot be determined", async () => {
    const root = project(["src/A.php", "composer.json"], ["vendor/bin/phpunit", "vendor/bin/phpstan"]);
    const report = await phpVerify(
      { scope: "changed" },
      deps(root, {
        vcsStatus: async () => {
          throw new Error("no repository");
        },
      }),
    );
    expect(report.status).toBe("partial");
    expect(report.checks.find((check) => check.check === "composer")?.status).toBe("passed");
    expect(report.checks.find((check) => check.check === "lint")).toMatchObject({
      status: "unavailable",
      reason: "changed-scope-unavailable",
    });
    expect(report.text).toContain('scope: "all"');
  });

  it("uses provided paths for lint while tests still use VCS mapping", async () => {
    const root = project(["src/A.php", "src/B.php", "tests/ATest.php"], ["vendor/bin/phpunit"]);
    const linted: string[] = [];
    const tested: string[] = [];
    const report = await phpVerify(
      { scope: "changed", checks: ["lint", "tests"], paths: ["src/B.php"] },
      deps(root, {
        runner: runner((cmd, args) => {
          if (cmd === "php") linted.push(...args);
          if (cmd.endsWith("phpunit")) tested.push(...args);
          return defaultScript(cmd);
        }),
      }),
    );
    expect(report.status).toBe("passed");
    expect(linted).toContain("src/B.php");
    expect(linted).not.toContain("src/A.php");
    expect(tested).toContain("tests/ATest.php");
    expect(tested.some((arg) => arg.startsWith("src/"))).toBe(false);
  });

  it("uses provided paths for lint in scope all while tests run the full suite", async () => {
    const root = project(["src/A.php", "src/B.php", "tests/ATest.php"], ["vendor/bin/phpunit"]);
    const linted: string[] = [];
    const tested: string[] = [];
    const report = await phpVerify(
      { scope: "all", checks: ["lint", "tests"], paths: ["src/B.php"] },
      deps(root, {
        vcsStatus: async () => ({ data: [{ file: "src/A.php", status: "modified" }] }),
        runner: runner((cmd, args) => {
          if (cmd === "php") linted.push(...args);
          if (cmd.endsWith("phpunit")) tested.push(...args);
          return defaultScript(cmd);
        }),
      }),
    );
    expect(report.status).toBe("passed");
    expect(linted).toContain("src/B.php");
    expect(linted).not.toContain("src/A.php");
    expect(tested).not.toContain("tests/ATest.php");
  });

  it("rejects paths outside the verification root", async () => {
    const root = project(["src/A.php"]);
    const report = await phpVerify({ scope: "changed", paths: ["../escape.php"] }, deps(root));
    expect(report.status).toBe("error");
    expect(report.text).toContain("path escapes the verification root");
  });

  it("reports denied commands as cancelled and never spawns them", async () => {
    const root = project(["src/A.php", "composer.json"], ["vendor/bin/phpunit", "vendor/bin/phpstan"]);
    const spy = vi.fn(async (_cmd: string, _args: readonly string[], _cwd: string) => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      killed: false,
      aborted: false,
    }));
    const report = await phpVerify(
      { scope: "all", checks: ["lint", "composer"] },
      deps(root, {
        runner: { run: spy },
        permissionRules: [{ action: "bash", resource: "php*", effect: "deny" }],
      }),
    );
    expect(spy.mock.calls.some(([cmd]) => cmd === "php")).toBe(false);
    expect(report.checks.find((check) => check.check === "lint")).toMatchObject({
      status: "cancelled",
      reason: "permission:denied",
    });
    expect(report.checks.find((check) => check.check === "composer")?.status).toBe("passed");
    expect(report.status).toBe("partial");
  });

  it("marks explicitly requested missing tooling as unavailable", async () => {
    const root = project(["src/A.php", "composer.json"]);
    const report = await phpVerify(
      { scope: "all", checks: ["style", "composer"] },
      deps(root, {
        profileFor: async () =>
          profile({
            tools: { ...profile().tools, csFixer: false },
            configFiles: { ...profile().configFiles, csFixer: null },
          }),
      }),
    );
    expect(report.status).toBe("partial");
    expect(report.checks.find((check) => check.check === "style")).toMatchObject({
      status: "unavailable",
      reason: "not-installed",
    });
  });

  it("cancels every check when the signal is already aborted", async () => {
    const root = project(["src/A.php", "composer.json"]);
    const controller = new AbortController();
    controller.abort();
    const report = await phpVerify(
      { scope: "all", checks: ["lint", "composer"] },
      deps(root, { signal: controller.signal }),
    );
    expect(report.status).toBe("partial");
    for (const check of report.checks) {
      expect(check).toMatchObject({ status: "cancelled", reason: "aborted" });
    }
  });

  it("rejects an invalid checks list", async () => {
    const root = project(["src/A.php"]);
    const report = await phpVerify(
      { checks: ["lint", "nope"] as never },
      deps(root),
    );
    expect(report.status).toBe("error");
    expect(report.text).toContain("checks must be");
  });
});

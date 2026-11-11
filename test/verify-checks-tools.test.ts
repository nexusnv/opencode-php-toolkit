import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import { architectureCheck } from "../src/verify/checks/architecture.js";
import { testsCheck } from "../src/verify/checks/tests.js";
import { MAX_STYLE_FILES, styleCheck } from "../src/verify/checks/style.js";
import type { CheckEnvironment } from "../src/verify/checks/shared.js";
import type { ChangedScope } from "../src/verify/changed.js";
import type { CommandRunner, RunResult } from "../src/tools/runner.js";

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

function binary(root: string, rel: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, "#!/bin/sh\n", { mode: 0o755 });
  chmodSync(full, 0o755);
}

function project(files: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-check-tools-"));
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "<?php");
  }
  return root;
}

const JUNIT_CLEAN =
  '<testsuites><testsuite tests="2" assertions="3" failures="0" errors="0" skipped="0"></testsuite></testsuites>';
const JUNIT_FAILING =
  '<testsuites><testsuite tests="2" assertions="3" failures="1" errors="0" skipped="0"></testsuite></testsuites>';
const JUNIT_SKIPPED =
  '<testsuites><testsuite tests="2" assertions="3" failures="0" errors="0" skipped="1"></testsuite></testsuites>';

const changed: ChangedScope = {
  source: "vcs",
  files: ["src/A.php"],
  deleted: [],
  truncated: false,
  note: null,
};

function env(root: string, overrides: Partial<CheckEnvironment> = {}): CheckEnvironment {
  const profile = {
    hasComposerJson: true,
    tools: {
      phpunit: true,
      pest: false,
      phpstan: false,
      psalm: false,
      csFixer: false,
      phpcs: false,
      deptrac: false,
    },
    configFiles: {
      phpunit: "phpunit.xml",
      pest: null,
      phpstan: null,
      psalm: null,
      phpcs: null,
      csFixer: null,
      deptrac: null,
      architecture: null,
    },
    layout: { sourceRoots: ["src"], testRoots: ["tests"] },
  } as unknown as ProjectProfile;
  return {
    root,
    profile,
    scope: "changed",
    changed,
    files: ["src/A.php"],
    pathOverride: false,
    runner: runner(() => ({})),
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("testsCheck", () => {
  it("maps changed production files to tests and passes", async () => {
    const root = project(["src/A.php", "tests/ATest.php"]);
    binary(root, "vendor/bin/phpunit");
    let args: readonly string[] = [];
    const result = await testsCheck(
      env(root, {
        runner: runner((_cmd, next) => {
          args = next;
          return { stdout: JUNIT_CLEAN };
        }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(result.summary).toContain("targeted");
    expect(args).toContain("tests/ATest.php");
    expect(args).not.toContain("src/A.php");
  });

  it("falls back to the full suite when no test maps", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/phpunit");
    let args: readonly string[] = [];
    const result = await testsCheck(
      env(root, {
        runner: runner((_cmd, next) => {
          args = next;
          return { stdout: JUNIT_CLEAN };
        }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(result.reason).toBe("tests:full-suite-fallback");
    expect(args).not.toContain("src/A.php");
  });

  it("fails failing tests", async () => {
    const root = project(["src/A.php", "tests/ATest.php"]);
    binary(root, "vendor/bin/phpunit");
    const result = await testsCheck(
      env(root, { runner: runner(() => ({ stdout: JUNIT_FAILING })) }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 1 });
  });

  it("keeps known failures when another targeted file has no report", async () => {
    const root = project(["tests/ATest.php", "tests/BTest.php"]);
    binary(root, "vendor/bin/phpunit");
    const result = await testsCheck(
      env(root, {
        changed: {
          source: "vcs",
          files: ["tests/ATest.php", "tests/BTest.php"],
          deleted: [],
          truncated: false,
          note: null,
        },
        runner: runner((_cmd, args) =>
          args.at(-1) === "tests/BTest.php" ? {} : { stdout: JUNIT_FAILING },
        ),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 1 });
    expect(result.summary).toContain("incomplete report");
  });

  it("warns when tests were skipped", async () => {
    const root = project(["src/A.php", "tests/ATest.php"]);
    binary(root, "vendor/bin/phpunit");
    const result = await testsCheck(
      env(root, { runner: runner(() => ({ stdout: JUNIT_SKIPPED })) }),
    );
    expect(result).toMatchObject({ status: "warning", reason: "tests:skipped" });
  });

  it("warns when the runner exits 0 without JUnit", async () => {
    const root = project(["src/A.php", "tests/ATest.php"]);
    binary(root, "vendor/bin/phpunit");
    const result = await testsCheck(env(root));
    expect(result).toMatchObject({ status: "warning", reason: "no-test-report" });
  });

  it("skips when the changed list is empty", async () => {
    const root = project(["src/A.php"]);
    const result = await testsCheck(
      env(root, { changed: { source: "vcs", files: [], deleted: [], truncated: false, note: null } }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "no-changed-files" });
  });

  it("skips non-PHP changes", async () => {
    const root = project(["src/A.php"]);
    const result = await testsCheck(
      env(root, { changed: { source: "vcs", files: ["README.md"], deleted: [], truncated: false, note: null } }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "no-relevant-changes" });
  });
});

describe("styleCheck", () => {
  it("passes a clean CS-Fixer dry run", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/php-cs-fixer");
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, csFixer: true } },
      }),
    );
    expect(result.status).toBe("passed");
  });

  it("fails when CS-Fixer would change files", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/php-cs-fixer");
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, csFixer: true } },
        runner: runner(() => ({
          ok: false,
          code: 8,
          stdout: "Found 2 of 3 files that can be fixed",
        })),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 2 });
  });

  it("reports a missing configured binary as unavailable", async () => {
    const root = project(["src/A.php"]);
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, csFixer: true } },
      }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("uses PHPCS when CS-Fixer is absent", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/phpcs");
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, phpcs: true } },
        runner: runner(() => ({ ok: false, code: 1, stdout: "A TOTAL OF 2 ERRORS AND 1 WARNINGS WERE FOUND IN 1 FILES" })),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 3 });
  });

  it("recognizes PHPCS 4 finding exit codes", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/phpcs");
    const base = env(root, {
      profile: { ...env(root).profile, tools: { ...env(root).profile.tools, phpcs: true } },
    });
    const summary = "A TOTAL OF 1 ERRORS AND 2 WARNINGS WERE FOUND IN 1 FILES";
    for (const code of [2, 3]) {
      const result = await styleCheck({
        ...base,
        runner: runner(() => ({ ok: false, code, stdout: summary })),
      });
      expect(result, `exit code ${code}`).toMatchObject({ status: "failed", findings: 3 });
    }
  });

  it("keeps a PHPCS 3 processing error unavailable", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/phpcs");
    const result = await styleCheck(
      env(root, {
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, phpcs: true } },
        runner: runner(() => ({ ok: false, code: 3, stderr: "ERROR: referenced sniff does not exist" })),
      }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "execution-failed" });
  });

  it("classifies PHPCS finding exits without a summary", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/phpcs");
    const base = env(root, {
      profile: { ...env(root).profile, tools: { ...env(root).profile.tools, phpcs: true } },
    });
    for (const code of [1, 2]) {
      const result = await styleCheck({
        ...base,
        runner: runner(() => ({ ok: false, code })),
      });
      expect(result, `exit code ${code}`).toMatchObject({ status: "failed", findings: 1 });
    }
  });

  it("reports a clean but capped style scope as truncated", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/php-cs-fixer");
    const files = Array.from({ length: MAX_STYLE_FILES + 1 }, (_, i) => `src/F${i}.php`);
    const result = await styleCheck(
      env(root, {
        files,
        profile: { ...env(root).profile, tools: { ...env(root).profile.tools, csFixer: true } },
      }),
    );
    expect(result).toMatchObject({ status: "warning", reason: "scope-truncated" });
    expect(result.summary).toContain("1 file(s) not checked");
  });
});

describe("architectureCheck", () => {
  it("is skipped scanner-unavailable without Deptrac", async () => {
    const root = project(["src/A.php"]);
    const result = await architectureCheck(env(root));
    expect(result).toMatchObject({ status: "skipped", reason: "scanner-unavailable" });
  });

  it("reports configured boundaries as scanner-unavailable", async () => {
    const root = project(["src/A.php"]);
    const base = env(root);
    const result = await architectureCheck(
      env(root, {
        profile: {
          ...base.profile,
          configFiles: { ...base.profile.configFiles, architecture: "php-toolkit.json" },
        },
      }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "scanner-unavailable" });
    expect(result.summary).toContain("configured boundaries");
  });

  it("is unavailable when Deptrac is configured but not installed", async () => {
    const root = project(["src/A.php"]);
    const base = env(root);
    const result = await architectureCheck(
      env(root, {
        profile: { ...base.profile, tools: { ...base.profile.tools, deptrac: true } },
      }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("passes a clean Deptrac run", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/deptrac");
    const base = env(root);
    const result = await architectureCheck(
      env(root, {
        profile: { ...base.profile, tools: { ...base.profile.tools, deptrac: true } },
      }),
    );
    expect(result.status).toBe("passed");
  });

  it("fails Deptrac violations", async () => {
    const root = project(["src/A.php"]);
    binary(root, "vendor/bin/deptrac");
    const base = env(root);
    const result = await architectureCheck(
      env(root, {
        profile: { ...base.profile, tools: { ...base.profile.tools, deptrac: true } },
        runner: runner(() => ({ ok: false, code: 1, stdout: "3 violations found" })),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 3 });
  });
});

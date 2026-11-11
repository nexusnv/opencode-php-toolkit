import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import type { ChangedScope } from "../src/verify/changed.js";
import { composerCheck } from "../src/verify/checks/composer.js";
import { LINT_FILE_CAP, lintCheck } from "../src/verify/checks/lint.js";
import { MAX_STATIC_FILES, staticCheck } from "../src/verify/checks/static.js";
import type { CheckEnvironment } from "../src/verify/checks/shared.js";
import {
  PERMISSION_DENIED_CODE,
  type CommandRunner,
  type RunResult,
} from "../src/tools/runner.js";

function tempProject(binary: string): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-static-"));
  const full = join(root, binary);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, "#!/bin/sh\n");
  chmodSync(full, 0o755);
  return root;
}

type Script = (cmd: string, args: readonly string[], cwd: string) => Partial<RunResult>;

function runner(script: Script): CommandRunner {
  return {
    run: async (cmd, args, cwd) => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      killed: false,
      aborted: false,
      ...script(cmd, args, cwd),
    }),
  };
}

const changed: ChangedScope = {
  source: "vcs",
  files: ["src/A.php"],
  deleted: [],
  truncated: false,
  note: null,
};

function env(overrides: Partial<CheckEnvironment> = {}): CheckEnvironment {
  const profile = {
    hasComposerJson: true,
    tools: { phpstan: true, psalm: false },
  } as unknown as ProjectProfile;
  return {
    root: "/repo",
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

describe("lintCheck", () => {
  it("passes a clean file", async () => {
    const result = await lintCheck(env({ runner: runner(() => ({ stdout: "No syntax errors detected" })) }));
    expect(result).toMatchObject({ status: "passed", reason: null, findings: 0 });
    expect(result.summary).toContain("1 file(s), 0 errors");
  });

  it("fails a parse error", async () => {
    const result = await lintCheck(
      env({ runner: runner(() => ({ ok: false, code: 255, stdout: "PHP Parse error" })) }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 1 });
  });

  it("reports a missing PHP binary as unavailable", async () => {
    const result = await lintCheck(env({ runner: runner(() => ({ ok: false, code: "ENOENT" })) }));
    expect(result).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("reports an abort as cancelled", async () => {
    const result = await lintCheck(
      env({ runner: runner(() => ({ ok: false, killed: true, aborted: true })) }),
    );
    expect(result).toMatchObject({ status: "cancelled", reason: "aborted" });
  });

  it("reports a timeout as timed_out", async () => {
    const result = await lintCheck(
      env({ runner: runner(() => ({ ok: false, killed: true, aborted: false })) }),
    );
    expect(result).toMatchObject({ status: "timed_out", reason: "timeout" });
  });

  it("reports a denied command as cancelled and never bypasses it", async () => {
    const result = await lintCheck(
      env({ runner: runner(() => ({ ok: false, code: PERMISSION_DENIED_CODE })) }),
    );
    expect(result).toMatchObject({ status: "cancelled", reason: "permission:denied" });
  });

  it("skips when no PHP files changed", async () => {
    const result = await lintCheck(env({ files: [] }));
    expect(result).toMatchObject({ status: "skipped", reason: "no-relevant-changes" });
  });

  it("lints every file in batches instead of stopping at the first cap", async () => {
    let calls = 0;
    const files = Array.from({ length: LINT_FILE_CAP + 2 }, (_, i) => `src/F${i}.php`);
    const result = await lintCheck(
      env({
        files,
        runner: runner(() => {
          calls += 1;
          return {};
        }),
      }),
    );
    expect(calls).toBe(files.length);
    expect(result).toMatchObject({ status: "passed", findings: 0 });
    expect(result.summary).toContain(`${files.length} file(s), 0 errors`);
  });

  it("keeps known parse errors when a later lint command is denied", async () => {
    const result = await lintCheck(
      env({
        files: ["src/Broken.php", "src/Denied.php"],
        runner: runner((_cmd, args) => {
          if (args.includes("src/Denied.php")) return { ok: false, code: PERMISSION_DENIED_CODE };
          return { ok: false, code: 255, stdout: "PHP Parse error" };
        }),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 1 });
    expect(result.summary).toContain("run incomplete");
  });
});

describe("composerCheck", () => {
  it("passes a valid manifest", async () => {
    const result = await composerCheck(env({ runner: runner(() => ({ stdout: "valid" })) }));
    expect(result).toMatchObject({ status: "passed", summary: "valid" });
  });

  it("fails an invalid manifest", async () => {
    const result = await composerCheck(env({ runner: runner(() => ({ ok: false, code: 1 })) }));
    expect(result).toMatchObject({ status: "failed", findings: 1 });
  });

  it("is unavailable without composer.json", async () => {
    const result = await composerCheck(
      env({ profile: { hasComposerJson: false, tools: {} } as unknown as ProjectProfile }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "not-configured" });
  });
});

describe("staticCheck", () => {
  it("passes a clean analysis", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const result = await staticCheck(env({ root }));
    expect(result).toMatchObject({ status: "passed", findings: 0 });
    expect(result.summary).toContain("PHPStan");
  });

  it("fails with analyzer findings", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const result = await staticCheck(
      env({
        root,
        runner: runner(() => ({
          ok: false,
          code: 1,
          stdout: `{"totals":{"errors":1,"file_errors":1},"files":{"${join(root, "src/A.php")}":{"messages":[{"message":"bad"}]}}}`,
        })),
      }),
    );
    expect(result).toMatchObject({ status: "failed", findings: 2 });
  });

  it("is unavailable when no analyzer is installed", async () => {
    const result = await staticCheck(
      env({ profile: { hasComposerJson: true, tools: { phpstan: false, psalm: false } } as unknown as ProjectProfile }),
    );
    expect(result).toMatchObject({ status: "unavailable", reason: "not-installed" });
  });

  it("detects an analyzer from its config file", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const result = await staticCheck(
      env({
        root,
        profile: {
          hasComposerJson: true,
          tools: { phpstan: false, psalm: false },
          configFiles: { phpstan: "phpstan.neon", psalm: null },
        } as unknown as ProjectProfile,
      }),
    );
    expect(result.status).toBe("passed");
    expect(result.summary).toContain("PHPStan");
  });

  it("passes explicit file paths only in changed scope", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const seen: string[][] = [];
    const result = await staticCheck(
      env({
        root,
        runner: runner((cmd, args) => {
          seen.push([...args]);
          return {};
        }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(seen[0]).toContain("src/A.php");
  });

  it("does not pass file paths in scope all", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const seen: string[][] = [];
    await staticCheck(
      env({
        root,
        scope: "all",
        runner: runner((cmd, args) => {
          seen.push([...args]);
          return {};
        }),
      }),
    );
    expect(seen[0]).not.toContain("src/A.php");
  });

  it("runs full analysis in scope all when discovery found no files", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const seen: string[][] = [];
    const result = await staticCheck(
      env({
        root,
        scope: "all",
        files: [],
        runner: runner((cmd, args) => {
          seen.push([...args]);
          return {};
        }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain("src/A.php");
    expect(result.summary).toContain("full analysis");
  });

  it("passes explicit paths in scope all", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const seen: string[][] = [];
    const result = await staticCheck(
      env({
        root,
        scope: "all",
        pathOverride: true,
        runner: runner((cmd, args) => {
          seen.push([...args]);
          return {};
        }),
      }),
    );
    expect(result.status).toBe("passed");
    expect(seen[0]).toContain("src/A.php");
  });

  it("reports a clean but capped changed scope as truncated", async () => {
    const root = tempProject("vendor/bin/phpstan");
    const files = Array.from({ length: MAX_STATIC_FILES + 1 }, (_, i) => `src/F${i}.php`);
    const result = await staticCheck(
      env({
        root,
        files,
        runner: runner(() => ({ stdout: "{}" })),
      }),
    );
    expect(result).toMatchObject({ status: "warning", reason: "scope-truncated" });
    expect(result.summary).toContain("1 file(s) not analysed");
  });
});

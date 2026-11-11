import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PERMISSION_APPROVAL_CODE,
  PERMISSION_DENIED_CODE,
  authorizedRunner,
  execFileRunner,
  isMissingBinary,
  type CommandRunner,
} from "../src/tools/runner.js";

const cwd = mkdtempSync(join(tmpdir(), "php-toolkit-runner-"));

describe("execFileRunner", () => {
  it("runs a command and captures stdout", async () => {
    const result = await execFileRunner.run(process.execPath, ["-e", "process.stdout.write('ok')"], cwd, 5000);
    expect(result).toMatchObject({ ok: true, stdout: "ok", killed: false, aborted: false });
  });

  it("reports a missing binary as ENOENT", async () => {
    const result = await execFileRunner.run("php-toolkit-definitely-missing", [], cwd, 5000);
    expect(result.code).toBe("ENOENT");
    expect(isMissingBinary(result)).toBe(true);
  });

  it("does not spawn when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await execFileRunner.run(process.execPath, ["-e", "process.exit(0)"], cwd, 5000, controller.signal);
    expect(result).toMatchObject({ ok: false, killed: true, aborted: true });
  });

  it("marks a timeout as killed but not aborted", async () => {
    const result = await execFileRunner.run(
      process.execPath,
      ["-e", "setTimeout(() => {}, 5000)"],
      cwd,
      50,
    );
    expect(result.killed).toBe(true);
    expect(result.aborted).toBe(false);
  });

  it("marks an aborted run as aborted", async () => {
    const controller = new AbortController();
    const pending = execFileRunner.run(
      process.execPath,
      ["-e", "setTimeout(() => {}, 5000)"],
      cwd,
      5000,
      controller.signal,
    );
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ killed: true, aborted: true });
  });
});

describe("authorizedRunner", () => {
  it("does not call the base runner when the command is denied", async () => {
    const base: CommandRunner = { run: vi.fn() };
    const runner = authorizedRunner(base, () => ({ allowed: false, reason: "permission:denied" }));
    const result = await runner.run("php", ["-l", "a.php"], cwd, 5000);
    expect(base.run).not.toHaveBeenCalled();
    expect(result.code).toBe(PERMISSION_DENIED_CODE);
  });

  it("does not call the base runner when approval is required", async () => {
    const base: CommandRunner = { run: vi.fn() };
    const runner = authorizedRunner(base, () => ({ allowed: false, reason: "permission:approval-required" }));
    const result = await runner.run("php", ["-l", "a.php"], cwd, 5000);
    expect(base.run).not.toHaveBeenCalled();
    expect(result.code).toBe(PERMISSION_APPROVAL_CODE);
  });

  it("delegates to the base runner when allowed", async () => {
    const expected = { ok: true, stdout: "", stderr: "", code: 0, killed: false, aborted: false };
    const base: CommandRunner = { run: vi.fn(async () => expected) };
    const runner = authorizedRunner(base, () => ({ allowed: true }));
    await expect(runner.run("php", ["-l", "a.php"], cwd, 5000)).resolves.toBe(expected);
    expect(base.run).toHaveBeenCalledOnce();
  });
});

import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildProjectProfile } from "../src/profile.js";
import type { CommandRunner, RunResult } from "../src/tools/runner.js";
import { scanArchitecture } from "../src/architecture/scanner.js";

function result(stdout: string, overrides: Partial<RunResult> = {}): RunResult {
  return { ok: true, stdout, stderr: "", code: 0, killed: false, aborted: false, ...overrides };
}

const source = "<?php class Example {}\n";
const payloadFor = (text: string) => JSON.stringify({
  status: "ok",
  scannerVersion: "4",
  filesScanned: 1,
  truncated: false,
  diagnostics: [],
  fingerprints: { "Example.php": `content:${createHash("sha256").update(text).digest("hex")}` },
  results: [],
});
const payload = payloadFor(source);

describe("scanArchitecture", () => {
  it("uses the bounded PHP CLI contract and validates its result", async () => {
    const root = await mkdtemp(join(tmpdir(), "architecture-scan-"));
    try {
      await writeFile(join(root, "Example.php"), source);
      const profile = await buildProjectProfile(root, null);
      let invocation: { cmd: string; args: readonly string[]; cwd: string; timeoutMs: number } | undefined;
      const runner: CommandRunner = { run: async (cmd, args, cwd, timeoutMs) => {
        invocation = { cmd, args, cwd, timeoutMs };
        return result(payload);
      } };
      const scan = await scanArchitecture(root, profile, { runner, maxFiles: 12 });
      expect(invocation?.cmd).toBe("php");
      expect(invocation?.cwd).toBe(root);
      expect(invocation?.timeoutMs).toBeGreaterThan(0);
      expect(invocation?.timeoutMs).toBeLessThanOrEqual(20_000);
      expect(invocation?.args).toEqual(expect.arrayContaining(["--directory", root, "--format", "json", "--max-files", "12"]));
      expect(scan.status).toBe("ok");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("caches successful results by project identity and supports invalidation", async () => {
    const root = await mkdtemp(join(tmpdir(), "architecture-scan-"));
    try {
      await writeFile(join(root, "Example.php"), source);
      const profile = await buildProjectProfile(root, null);
      let runs = 0;
      const runner: CommandRunner = { run: async () => { runs++; return result(payload); } };
      const first = await scanArchitecture(root, profile, { runner });
      const second = await scanArchitecture(root, profile, { runner });
      expect(first.cacheHit).toBe(false);
      expect(second.cacheHit).toBe(true);
      expect(runs).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not cache a scan when scanned-file bytes differ from key preparation", async () => {
    const root = await mkdtemp(join(tmpdir(), "architecture-scan-fingerprint-race-"));
    try {
      await writeFile(join(root, "Example.php"), source);
      const profile = await buildProjectProfile(root, null);
      const persisted = new Map<string, unknown>();
      const storage = {
        get: async (key: string) => persisted.get(key),
        set: async (key: string, value: unknown) => { persisted.set(key, value); },
      };
      const changedSource = "<?php class ChangedDuringScan {}\n";
      const raced = await scanArchitecture(root, profile, {
        storage,
        runner: { run: async () => {
          await writeFile(join(root, "Example.php"), changedSource);
          return result(payloadFor(changedSource));
        } },
      });
      expect(raced.status).toBe("ok");
      expect(persisted.size).toBe(0);

      const stable = await scanArchitecture(root, await buildProjectProfile(root, null), {
        storage,
        runner: { run: async () => result(payloadFor(changedSource)) },
      });
      expect(stable.status).toBe("ok");
      expect(persisted.size).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("normalizes invalid JSON, oversized output, abort, and timeout without claiming clean", async () => {
    const root = await mkdtemp(join(tmpdir(), "architecture-scan-"));
    try {
      const profile = await buildProjectProfile(root, null);
      const invalid = await scanArchitecture(root, profile, { runner: { run: async () => result("not json") } });
      expect(invalid.status).toBe("error");
      const oversized = await scanArchitecture(root, profile, { runner: { run: async () => result("x".repeat(1_100_000)) } });
      expect(oversized.status).toBe("error");
      const aborted = await scanArchitecture(root, profile, { signal: AbortSignal.abort(), runner: { run: async () => result("", { killed: true, aborted: true, code: "ABORT_ERR" }) } });
      expect(aborted.status).toBe("cancelled");
      const timeout = await scanArchitecture(root, profile, { runner: { run: async () => result("", { ok: false, killed: true }) } });
      expect(timeout.status).toBe("timed-out");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("counts cache preparation within the requested total scan budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "architecture-scan-budget-"));
    try {
      await writeFile(join(root, "Example.php"), source);
      const profile = await buildProjectProfile(root, null);
      const now = vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValue(102);
      const run = vi.fn(async () => result(payload));
      const scan = await scanArchitecture(root, profile, { runner: { run }, timeoutMs: 1 });
      expect(scan.status).toBe("timed-out");
      expect(run).not.toHaveBeenCalled();
      now.mockRestore();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

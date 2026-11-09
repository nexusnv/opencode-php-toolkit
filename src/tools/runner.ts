import { execFile } from "node:child_process";

/** Reports (JUnit, analyzer JSON) can far exceed 1 MiB on large projects. */
export const MAX_REPORT_BUFFER = 64 * 1024 * 1024;

export const PERMISSION_DENIED_CODE = "PERMISSION_DENIED";
export const PERMISSION_APPROVAL_CODE = "PERMISSION_APPROVAL_REQUIRED";

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Exit code when the command ran, "ENOENT" when the binary is missing. */
  code: number | string | null;
  /** True when the process was killed (timeout or abort). */
  killed: boolean;
  /** True when the AbortSignal fired or was already aborted. */
  aborted: boolean;
}

export type CommandDecision =
  | { allowed: true }
  | { allowed: false; reason: "permission:denied" | "permission:approval-required" };

export type CommandAuthorizer = (
  cmd: string,
  args: readonly string[],
  cwd: string,
) => CommandDecision;

export interface CommandRunner {
  run(
    cmd: string,
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<RunResult>;
}

export const execFileRunner: CommandRunner = {
  run(cmd, args, cwd, timeoutMs, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        // An already-aborted signal never fires its abort event, so the
        // listener below would not stop the child - do not spawn at all.
        resolve({ ok: false, stdout: "", stderr: "", code: "ABORT_ERR", killed: true, aborted: true });
        return;
      }
      const child = execFile(
        cmd,
        [...args],
        { cwd, timeout: timeoutMs, maxBuffer: MAX_REPORT_BUFFER },
        (err, stdout, stderr) => {
          resolve({
            ok: !err,
            stdout: String(stdout ?? ""),
            stderr:
              typeof stderr === "string" && stderr.length > 0
                ? String(stderr)
                : String((err as Error)?.message ?? ""),
            code: (err as { code?: number | string } | null)?.code ?? null,
            killed: Boolean(
              (err as { killed?: boolean; signal?: NodeJS.Signals } | null)?.killed ||
                (err as { signal?: NodeJS.Signals } | null)?.signal,
            ),
            aborted: Boolean(signal?.aborted),
          });
        },
      );
      signal?.addEventListener("abort", () => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      });
    });
  },
};

/** Wraps a runner so every spawn passes through the session permission gate. */
export function authorizedRunner(base: CommandRunner, authorize: CommandAuthorizer): CommandRunner {
  return {
    async run(cmd, args, cwd, timeoutMs, signal) {
      const decision = authorize(cmd, args, cwd);
      if (!decision.allowed) {
        return {
          ok: false,
          stdout: "",
          stderr: decision.reason,
          code:
            decision.reason === "permission:denied"
              ? PERMISSION_DENIED_CODE
              : PERMISSION_APPROVAL_CODE,
          killed: false,
          aborted: false,
        };
      }
      return base.run(cmd, args, cwd, timeoutMs, signal);
    },
  };
}

export function isMissingBinary(result: RunResult): boolean {
  return result.code === "ENOENT" || result.stderr.includes("command not found");
}

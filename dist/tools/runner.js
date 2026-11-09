import { execFile } from "node:child_process";
/** Reports (JUnit, analyzer JSON) can far exceed 1 MiB on large projects. */
export const MAX_REPORT_BUFFER = 64 * 1024 * 1024;
export const PERMISSION_DENIED_CODE = "PERMISSION_DENIED";
export const PERMISSION_APPROVAL_CODE = "PERMISSION_APPROVAL_REQUIRED";
export const execFileRunner = {
    run(cmd, args, cwd, timeoutMs, signal) {
        return new Promise((resolve) => {
            if (signal?.aborted) {
                // An already-aborted signal never fires its abort event, so the
                // listener below would not stop the child - do not spawn at all.
                resolve({ ok: false, stdout: "", stderr: "", code: "ABORT_ERR", killed: true, aborted: true });
                return;
            }
            const child = execFile(cmd, [...args], { cwd, timeout: timeoutMs, maxBuffer: MAX_REPORT_BUFFER }, (err, stdout, stderr) => {
                resolve({
                    ok: !err,
                    stdout: String(stdout ?? ""),
                    stderr: typeof stderr === "string" && stderr.length > 0
                        ? String(stderr)
                        : String(err?.message ?? ""),
                    code: err?.code ?? null,
                    killed: Boolean(err?.killed ||
                        err?.signal),
                    aborted: Boolean(signal?.aborted),
                });
            });
            signal?.addEventListener("abort", () => {
                try {
                    child.kill("SIGKILL");
                }
                catch {
                    // ignore
                }
            });
        });
    },
};
/** Wraps a runner so every spawn passes through the session permission gate. */
export function authorizedRunner(base, authorize) {
    return {
        async run(cmd, args, cwd, timeoutMs, signal) {
            const decision = authorize(cmd, args, cwd);
            if (!decision.allowed) {
                return {
                    ok: false,
                    stdout: "",
                    stderr: decision.reason,
                    code: decision.reason === "permission:denied"
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
export function isMissingBinary(result) {
    return result.code === "ENOENT" || result.stderr.includes("command not found");
}
//# sourceMappingURL=runner.js.map
/** Reports (JUnit, analyzer JSON) can far exceed 1 MiB on large projects. */
export declare const MAX_REPORT_BUFFER: number;
export declare const PERMISSION_DENIED_CODE = "PERMISSION_DENIED";
export declare const PERMISSION_APPROVAL_CODE = "PERMISSION_APPROVAL_REQUIRED";
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
export type CommandDecision = {
    allowed: true;
} | {
    allowed: false;
    reason: "permission:denied" | "permission:approval-required";
};
export type CommandAuthorizer = (cmd: string, args: readonly string[], cwd: string) => CommandDecision;
export interface CommandRunner {
    run(cmd: string, args: readonly string[], cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<RunResult>;
}
export declare const execFileRunner: CommandRunner;
/** Wraps a runner so every spawn passes through the session permission gate. */
export declare function authorizedRunner(base: CommandRunner, authorize: CommandAuthorizer): CommandRunner;
export declare function isMissingBinary(result: RunResult): boolean;

export interface RunResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    /** Exit code when the command ran, "ENOENT" when the binary is missing. */
    code: number | string | null;
    /** True when the process was killed (timeout or abort). */
    killed: boolean;
}
/**
 * Result of a tool invocation.
 *
 * `status` describes the tool ("ok" = it did its job, "error" = it could not
 * run). `findings` describes the user's code: parse errors, advisories, an
 * invalid manifest. Keeping them apart is what makes the metric meaningful -
 * a lint that finds a broken file is a successful lint.
 */
export interface ToolOutcome {
    text: string;
    status: "ok" | "error";
    findings: number;
}
/** Counts advisories in `composer audit --format=json` output. */
export declare function countAdvisories(stdout: string): number;
export declare function phpLint(paths: string[], cwd: string, signal?: AbortSignal): Promise<ToolOutcome>;
export declare function composerValidate(cwd: string, signal?: AbortSignal): Promise<ToolOutcome>;
export declare function composerAudit(cwd: string, signal?: AbortSignal): Promise<ToolOutcome>;

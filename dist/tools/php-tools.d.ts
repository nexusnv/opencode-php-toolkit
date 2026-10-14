export interface RunResult {
    ok: boolean;
    stdout: string;
    stderr: string;
}
export declare function phpLint(paths: string[], cwd: string, signal?: AbortSignal): Promise<string>;
export declare function composerValidate(cwd: string, signal?: AbortSignal): Promise<string>;
export declare function composerAudit(cwd: string, signal?: AbortSignal): Promise<string>;

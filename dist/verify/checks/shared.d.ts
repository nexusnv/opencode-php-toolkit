import type { ProjectProfile } from "../../profile.js";
import type { ToolOutcome } from "../../tools/php-tools.js";
import { type CommandRunner, type RunResult } from "../../tools/runner.js";
import type { ChangedScope } from "../changed.js";
import { type CheckResult, type VerificationCheck, type VerificationScope } from "../types.js";
export interface CheckEnvironment {
    root: string;
    profile: ProjectProfile;
    scope: VerificationScope;
    changed: ChangedScope;
    /** Root-relative PHP files selected for lint/static/style. */
    files: string[];
    /** True when `files` came from the explicit `paths` input. */
    pathOverride: boolean;
    runner: CommandRunner;
    signal: AbortSignal;
}
export declare const passed: (check: VerificationCheck, summary: string) => CheckResult;
export declare const failed: (check: VerificationCheck, summary: string, findings: number, detail?: string | null) => CheckResult;
export declare const warning: (check: VerificationCheck, reason: string, summary: string, findings?: number, detail?: string | null) => CheckResult;
export declare const skipped: (check: VerificationCheck, reason: string, summary: string) => CheckResult;
export declare const unavailable: (check: VerificationCheck, reason: string, summary: string, detail?: string | null) => CheckResult;
export declare const cancelled: (check: VerificationCheck, reason: string, summary: string, detail?: string | null) => CheckResult;
export declare const timedOut: (check: VerificationCheck, summary: string) => CheckResult;
export declare function pathExists(path: string): Promise<boolean>;
/** Maps raw runner failures (style/architecture spawn directly). */
export declare function runFailure(check: VerificationCheck, result: RunResult, missingSummary: string): CheckResult | null;
/**
 * Maps a tool failure or operational error to a failed check, or returns null
 * when the tool completed and the adapter should interpret its findings.
 */
export declare function failureResult(check: VerificationCheck, outcome: ToolOutcome): CheckResult | null;

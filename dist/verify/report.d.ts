import { aggregateStatus } from "./aggregate.js";
import { type CheckResult, type VerificationScope } from "./types.js";
export declare const MAX_VERIFICATION_CHARS = 24000;
export declare function renderVerificationReport(input: {
    scope: VerificationScope;
    checks: readonly CheckResult[];
    permissionNote: string | null;
    changedNote: string | null;
    /** Set only when the tool could not produce a report at all. */
    error?: string | null;
}): {
    text: string;
    status: ReturnType<typeof aggregateStatus>;
    findings: number;
};

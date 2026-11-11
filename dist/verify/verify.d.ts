import type { ProjectProfile } from "../profile.js";
import type { PermissionRule } from "../routing/permissions.js";
import { type CommandRunner } from "../tools/runner.js";
import { type VcsFileStatusLike } from "./changed.js";
import { type VerificationCheck, type VerificationReport, type VerificationScope } from "./types.js";
export interface VerifyInput {
    directory?: string;
    scope?: VerificationScope;
    checks?: readonly VerificationCheck[];
    paths?: readonly string[];
}
export interface VerifyDependencies {
    /** Session root resolved from context.sessionID. */
    sessionRoot: string;
    profileFor: (root: string) => Promise<ProjectProfile>;
    vcsStatus: (directory: string) => Promise<{
        data: readonly VcsFileStatusLike[];
    }>;
    permissionRules?: readonly PermissionRule[];
    signal: AbortSignal;
    /** Defaults to execFileRunner; tests inject a scripted runner. */
    runner?: CommandRunner;
}
/** Detected checks in the fixed report order. `lint` is always available. */
export declare function detectedChecks(profile: ProjectProfile): VerificationCheck[];
export declare function phpVerify(input: VerifyInput, deps: VerifyDependencies): Promise<VerificationReport>;

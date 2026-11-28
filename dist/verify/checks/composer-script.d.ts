import { type CheckEnvironment } from "./shared.js";
import type { CheckResult, VerificationCheck } from "../types.js";
/** Executes one validated, project-defined Composer script as a whole-project check. */
export declare function composerScriptCheck(env: CheckEnvironment, check: VerificationCheck, scriptName: string): Promise<CheckResult>;

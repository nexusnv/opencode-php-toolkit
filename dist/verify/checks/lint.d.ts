import { type CheckEnvironment } from "./shared.js";
import type { CheckResult } from "../types.js";
/** Matches php_lint's own output cap so the summary is honest. */
export declare const LINT_FILE_CAP = 20;
export declare function lintCheck(env: CheckEnvironment): Promise<CheckResult>;

import { type CheckResult } from "../types.js";
import { type CheckEnvironment } from "./shared.js";
export declare const MAX_STATIC_FILES = 200;
export declare function staticCheck(env: CheckEnvironment): Promise<CheckResult>;

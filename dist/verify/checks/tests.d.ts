import type { ProjectProfile } from "../../profile.js";
import { type CheckResult } from "../types.js";
import { type CheckEnvironment } from "./shared.js";
export declare function testsDetected(profile: ProjectProfile): boolean;
export declare function testsCheck(env: CheckEnvironment): Promise<CheckResult>;

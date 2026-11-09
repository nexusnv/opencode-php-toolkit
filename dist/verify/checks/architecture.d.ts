import type { ProjectProfile } from "../../profile.js";
import { type CheckResult } from "../types.js";
import { type CheckEnvironment } from "./shared.js";
export declare function architectureDetected(profile: ProjectProfile): boolean;
export declare function architectureCheck(env: CheckEnvironment): Promise<CheckResult>;

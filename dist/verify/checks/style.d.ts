import type { ProjectProfile } from "../../profile.js";
import { type CheckResult } from "../types.js";
import { type CheckEnvironment } from "./shared.js";
export declare const MAX_STYLE_FILES = 200;
export type StyleTool = "cs-fixer" | "phpcs";
export declare function styleTool(profile: ProjectProfile): StyleTool | null;
export declare function styleCheck(env: CheckEnvironment): Promise<CheckResult>;

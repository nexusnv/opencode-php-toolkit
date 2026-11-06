export declare const MAX_ROUTER_SKILL_CHARS = 16000;
export interface ToolkitConfig {
    autoSkills: "attach" | "hint" | "off";
    maxSkills: number;
    maxSkillChars: number;
    architectureMode: "risk" | "strict" | "off";
    architectureScan: "tool" | "auto" | "off";
    announceSelections: "on-change" | "always" | "off";
    verification: "remind" | "off";
}
export declare const DEFAULT_TOOLKIT_CONFIG: ToolkitConfig;
export declare function readToolkitConfig(raw: unknown, warn?: (message: string) => void): ToolkitConfig;

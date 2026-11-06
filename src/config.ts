export interface ToolkitConfig {
  autoSkills: "attach" | "hint" | "off";
  maxSkills: number;
  maxSkillChars: number;
  // Architecture workflow mode. Phase 1 uses "off" to disable classifier
  // design gating; the full architecture workflow ships in a later phase.
  architectureMode: "risk" | "strict" | "off";
  architectureScan: "tool" | "auto" | "off";
  announceSelections: "on-change" | "always" | "off";
  verification: "remind" | "off";
}

export const DEFAULT_TOOLKIT_CONFIG: ToolkitConfig = {
  autoSkills: "attach",
  maxSkills: 3,
  maxSkillChars: 12_000,
  architectureMode: "risk",
  architectureScan: "tool",
  announceSelections: "off",
  verification: "remind",
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const boundedInt = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.floor(v) : undefined;

export function readToolkitConfig(
  raw: unknown,
  warn: (message: string) => void = (message) => console.warn(`[php-toolkit] ${message}`),
): ToolkitConfig {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_TOOLKIT_CONFIG };
  const take = <T extends string>(key: keyof ToolkitConfig, allowed: readonly T[]) => {
    const value = oneOf(input[key], allowed);
    if (value === undefined && input[key] !== undefined) warn(`invalid ${key}; using default`);
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  };
  take("autoSkills", ["attach", "hint", "off"]);
  take("architectureMode", ["risk", "strict", "off"]);
  take("architectureScan", ["tool", "auto", "off"]);
  take("announceSelections", ["on-change", "always", "off"]);
  take("verification", ["remind", "off"]);
  const maxSkills = boundedInt(input.maxSkills, 1, 4);
  if (maxSkills === undefined && input.maxSkills !== undefined) warn("invalid maxSkills; using default");
  else if (maxSkills !== undefined) out.maxSkills = maxSkills;
  const maxSkillChars = boundedInt(input.maxSkillChars, 1, 100_000);
  if (maxSkillChars === undefined && input.maxSkillChars !== undefined) warn("invalid maxSkillChars; using default");
  else if (maxSkillChars !== undefined) out.maxSkillChars = maxSkillChars;
  return out;
}

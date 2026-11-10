export const MAX_ROUTER_SKILL_CHARS = 16_000;

export interface ToolkitConfig {
  autoSkills: "attach" | "hint" | "off";
  maxSkills: number;
  maxSkillChars: number;
  // Architecture workflow mode. "risk" gives risk-based guidance, "strict"
  // always asks for a design note before implementation, and "off" removes
  // the architecture gate and its state-part guidance.
  architectureMode: "risk" | "strict" | "off";
  // Reserved for later phases; parsed but inert in Phase 1.
  architectureScan: "tool" | "auto" | "off";
  // Reserved for later phases; Phase 1 is always silent.
  announceSelections: "on-change" | "always" | "off";
  // Reserved for later phases; parsed but inert in Phase 1.
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
  const rawMaxSkillChars = input.maxSkillChars;
  if (
    typeof rawMaxSkillChars === "number" &&
    Number.isFinite(rawMaxSkillChars) &&
    rawMaxSkillChars > MAX_ROUTER_SKILL_CHARS
  ) {
    out.maxSkillChars = MAX_ROUTER_SKILL_CHARS;
    warn(`maxSkillChars capped at ${MAX_ROUTER_SKILL_CHARS}`);
  } else {
    const maxSkillChars = boundedInt(rawMaxSkillChars, 1, MAX_ROUTER_SKILL_CHARS);
    if (maxSkillChars === undefined && input.maxSkillChars !== undefined) {
      warn("invalid maxSkillChars; using default");
    } else if (maxSkillChars !== undefined) {
      out.maxSkillChars = maxSkillChars;
    }
  }
  return out;
}

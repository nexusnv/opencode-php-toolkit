export const MAX_ROUTER_SKILL_CHARS = 16_000;
export const DEFAULT_TOOLKIT_CONFIG = {
    autoSkills: "attach",
    maxSkills: 3,
    maxSkillChars: 12_000,
    architectureMode: "risk",
    architectureScan: "tool",
    announceSelections: "off",
    verification: "remind",
};
const oneOf = (v, allowed) => typeof v === "string" && allowed.includes(v) ? v : undefined;
const boundedInt = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.floor(v) : undefined;
export function readToolkitConfig(raw, warn = (message) => console.warn(`[php-toolkit] ${message}`)) {
    const input = raw && typeof raw === "object" ? raw : {};
    const out = { ...DEFAULT_TOOLKIT_CONFIG };
    const take = (key, allowed) => {
        const value = oneOf(input[key], allowed);
        if (value === undefined && input[key] !== undefined)
            warn(`invalid ${key}; using default`);
        if (value !== undefined)
            out[key] = value;
    };
    take("autoSkills", ["attach", "hint", "off"]);
    take("architectureMode", ["risk", "strict", "off"]);
    take("architectureScan", ["tool", "auto", "off"]);
    take("announceSelections", ["on-change", "always", "off"]);
    take("verification", ["remind", "off"]);
    const maxSkills = boundedInt(input.maxSkills, 1, 4);
    if (maxSkills === undefined && input.maxSkills !== undefined)
        warn("invalid maxSkills; using default");
    else if (maxSkills !== undefined)
        out.maxSkills = maxSkills;
    const rawMaxSkillChars = input.maxSkillChars;
    if (typeof rawMaxSkillChars === "number" &&
        Number.isFinite(rawMaxSkillChars) &&
        rawMaxSkillChars > MAX_ROUTER_SKILL_CHARS) {
        out.maxSkillChars = MAX_ROUTER_SKILL_CHARS;
        warn(`maxSkillChars capped at ${MAX_ROUTER_SKILL_CHARS}`);
    }
    else {
        const maxSkillChars = boundedInt(rawMaxSkillChars, 1, MAX_ROUTER_SKILL_CHARS);
        if (maxSkillChars === undefined && input.maxSkillChars !== undefined) {
            warn("invalid maxSkillChars; using default");
        }
        else if (maxSkillChars !== undefined) {
            out.maxSkillChars = maxSkillChars;
        }
    }
    return out;
}
//# sourceMappingURL=config.js.map
import { L0_CONSTITUTION } from "../constitution.js";
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
export function renderToolkitStatePart(context) {
    const { profile, state } = context;
    const lines = ["PHP toolkit context"];
    const framework = profile.frameworkHints.filter((hint) => hint !== "none");
    const php = profile.phpRequirement ? `PHP ${profile.phpRequirement}` : "PHP version unknown";
    lines.push(`Project: ${php} ${profile.type}; ${framework.length ? framework.join(" + ") : "no framework"}.`);
    if (framework.length) {
        lines.push(`Framework: ${framework.join(" + ")} — generic PHP routing; framework-specific rules live in the sibling toolkit.`);
    }
    const mode = context.boundaryMode ? ` (${context.boundaryMode})` : "";
    lines.push(`Task: generation ${state.taskGeneration}${mode} | intents: ${state.activeIntents.join(", ") || "none"} | concerns: ${state.activeConcerns.join(", ") || "none"}`);
    const selected = state.selectedSkills.length ? state.selectedSkills.join(", ") : "none";
    const attached = state.attachedSkills.length ? state.attachedSkills.join(", ") : "none";
    const activated = state.activatedSkills.size ? [...state.activatedSkills].join(", ") : "none";
    const pending = state.unactivatedSkills
        .filter((skill) => skill.status === "pending")
        .map((skill) => skill.id);
    const pendingText = pending.length ? pending.join(", ") : "none";
    lines.push(`Skills: selected=${selected}; attached=${attached}; activated=${activated}; pending: ${pendingText}`);
    return lines.join("\n");
}
export const PHP_TOOLKIT_PART = "php-toolkit";
export function removePhpToolkitParts(system) {
    return system.filter((part) => !(isRecord(part) && isRecord(part.metadata) && part.metadata[PHP_TOOLKIT_PART]));
}
export function l0Part() {
    return {
        type: "text",
        text: L0_CONSTITUTION,
        metadata: { "php-toolkit": { kind: "l0" } },
    };
}
export function statePart(text) {
    return {
        type: "text",
        text,
        metadata: { "php-toolkit": { kind: "state" } },
    };
}
//# sourceMappingURL=parts.js.map
import type { ProjectProfile } from "../profile.js";
import { L0_CONSTITUTION } from "../constitution.js";
import type { RoutingRenderContext } from "../routing/state.js";

// Structurally matches the SessionContext.system entries from @opencode/plugin.
type SystemPart = { type: "text"; text: string; metadata?: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function renderToolkitStatePart(context: RoutingRenderContext): string {
  const { profile, state } = context;
  const lines = ["PHP toolkit context"];
  const framework = profile.frameworkHints.filter((hint) => hint !== "none");
  const php = profile.phpRequirement ? `PHP ${profile.phpRequirement}` : "PHP version unknown";
  lines.push(
    `Project: ${php} ${profile.type}; ${framework.length ? framework.join(" + ") : "no framework"}.`,
  );
  const mode = context.boundaryMode ? ` (${context.boundaryMode})` : "";
  lines.push(
    `Task: generation ${state.taskGeneration}${mode} | intents: ${
      state.activeIntents.join(", ") || "none"
    } | concerns: ${state.activeConcerns.join(", ") || "none"}`,
  );
  const selected = state.selectedSkills.length ? state.selectedSkills.join(", ") : "none";
  const attached = state.attachedSkills.length ? state.attachedSkills.join(", ") : "none";
  const activated = state.activatedSkills.size ? [...state.activatedSkills].join(", ") : "none";
  const pending = state.unactivatedSkills
    .filter((skill) => skill.status === "pending")
    .map((skill) => skill.id);
  const pendingText = pending.length ? pending.join(", ") : "none";
  lines.push(
    `Skills: selected=${selected}; attached=${attached}; activated=${activated}; pending: ${pendingText}`,
  );
  return lines.join("\n");
}

export const PHP_TOOLKIT_PART = "php-toolkit";

export function removePhpToolkitParts(system: SystemPart[]): SystemPart[] {
  return system.filter(
    (part) => !(isRecord(part) && isRecord(part.metadata) && part.metadata[PHP_TOOLKIT_PART]),
  );
}

export function l0Part(): SystemPart {
  return {
    type: "text",
    text: L0_CONSTITUTION,
    metadata: { "php-toolkit": { kind: "l0" } },
  } as SystemPart;
}

export function statePart(text: string): SystemPart {
  return {
    type: "text",
    text,
    metadata: { "php-toolkit": { kind: "state" } },
  } as SystemPart;
}

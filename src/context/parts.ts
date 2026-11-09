import type { ProjectProfile } from "../profile.js";
import { L0_CONSTITUTION } from "../constitution.js";
import type { RoutingRenderContext } from "../routing/state.js";

// Structurally matches the SessionContext.system entries from @opencode/plugin.
type SystemPart = { type: "text"; text: string; metadata?: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function renderToolkitStatePart(
  context: RoutingRenderContext,
  options: { verification?: "remind" | "off" } = {},
): string {
  const { profile, state } = context;
  const lines = ["PHP toolkit context"];
  const framework = profile.frameworkHints.filter((hint) => hint !== "none");
  const php = profile.phpRequirement ? `PHP ${profile.phpRequirement}` : "PHP version unknown";
  lines.push(
    `Project: ${php} ${profile.type}; ${framework.length ? framework.join(" + ") : "no framework"}.`,
  );
  if (framework.length) {
    lines.push(
      `Framework: ${framework.join(" + ")} — generic PHP routing; framework-specific rules live in the sibling toolkit.`,
    );
  }
  const mode = context.boundaryMode ? ` (${context.boundaryMode})` : "";
  lines.push(
    `Task: generation ${state.taskGeneration}${mode} | intents: ${
      state.activeIntents.join(", ") || "none"
    } | concerns: ${state.activeConcerns.join(", ") || "none"}`,
  );
  const architecture =
    state.mode === "risk"
      ? "Architecture: risk mode — small reversible changes proceed with a one-line rationale; moderate changes state the chosen pattern and trade-off first; significant boundary, persistence, events, DI or breaking API changes need 2–3 options and approval."
      : state.mode === "strict"
        ? "Architecture: strict mode — present a design note and wait for approval before implementation."
        : null;
  if (architecture) lines.push(architecture);
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
  const reminder =
    options.verification !== "off" &&
    state.activeIntents.some(
      (intent) => intent === "Build" || intent === "Design" || intent === "Test",
    );
  if (reminder) {
    lines.push(
      "Before declaring completion: run php_verify (scope: changed), or explicitly report which checks are unavailable and why. Never claim a feature works without evidence.",
    );
  }
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

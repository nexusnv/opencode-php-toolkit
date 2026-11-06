import { loadOrCreateState } from "../routing/persistence.js";
function slug(target) {
    return target.toLowerCase().replace(/\s+/g, "-");
}
function toolNames(profile) {
    const tools = profile.tools;
    if (!tools)
        return [];
    const names = [];
    if (tools.phpunit)
        names.push("PHPUnit");
    if (tools.pest)
        names.push("Pest");
    if (tools.phpstan)
        names.push("PHPStan");
    if (tools.psalm)
        names.push("Psalm");
    if (tools.csFixer)
        names.push("CS-Fixer");
    if (tools.phpcs)
        names.push("PHPCS");
    if (tools.rector)
        names.push("Rector");
    if (tools.deptrac)
        names.push("Deptrac");
    if (tools.infection)
        names.push("Infection");
    return names;
}
function projectLine(profile) {
    const details = [profile.type, `${profile.typeConfidence} confidence`];
    if (profile.phpRequirement)
        details.push(`PHP ${profile.phpRequirement}`);
    const tools = toolNames(profile);
    if (tools.length)
        details.push(tools.join(" + "));
    const frameworks = profile.frameworkHints.filter((hint) => hint !== "none");
    details.push(frameworks.length ? frameworks.join(" + ") : "no framework");
    return `  Project: ${profile.root} (${details.join(", ")})`;
}
function list(values) {
    return values.length ? values.join(", ") : "none";
}
function reasonsFor(state) {
    const reasons = [
        ...state.activeIntents.map((intent) => `intent:${slug(intent)}`),
        ...state.activeConcerns.map((concern) => `concern:${slug(concern)}`),
        ...state.droppedSkills.map((drop) => drop.reason),
    ];
    return [...new Set(reasons)];
}
export function renderToolkitStatus(input) {
    const { profile, state, config } = input;
    const lines = ["PHP toolkit status"];
    if (!profile) {
        lines.push("  Project: unavailable (session has no location)");
    }
    else {
        lines.push(projectLine(profile));
        lines.push(`  Root: ${profile.root} (subpath: ${profile.subpath ?? "none"})`);
    }
    if (!state) {
        lines.push("  Task: unavailable");
    }
    else {
        lines.push(`  Task: generation ${state.taskGeneration}`);
        lines.push(`  Active: ${state.activeIntents.map((intent) => intent.toLowerCase()).join(", ") || "none"} | concerns: ${state.activeConcerns.map((concern) => concern.toLowerCase()).join(", ") || "none"}`);
        lines.push(`  Selected: ${list(state.selectedSkills)}`);
        lines.push(`  Attached: ${list(state.attachedSkills)}`);
        lines.push(`  Activated: ${list([...state.activatedSkills])}`);
        const pending = state.unactivatedSkills
            .filter((skill) => skill.status === "pending")
            .map((skill) => skill.id);
        lines.push(`  Pending: ${list(pending)}`);
        lines.push(`  Dropped: ${state.droppedSkills.length
            ? state.droppedSkills.map((drop) => `${drop.id} (${drop.reason})`).join(", ")
            : "none"}`);
        lines.push(`  Reasons: ${list(reasonsFor(state))}`);
    }
    lines.push(`  Mode: ${config.architectureMode} | scan: ${config.architectureScan} | announce: ${config.announceSelections}`);
    lines.push("  Verify: unavailable (Phase 3)");
    return lines.join("\n");
}
export async function buildCurrentStatusSnapshot(ctx, input) {
    const session = await ctx.session
        .get({ sessionID: input.sessionID })
        .catch(() => null);
    const root = session?.location?.directory;
    if (!root) {
        return renderToolkitStatus({ profile: null, state: null, config: input.config });
    }
    const subpath = session?.subpath ?? null;
    const profile = await input.profileCache.resolve(root, subpath);
    const state = await loadOrCreateState(ctx.storage, input.sessions, {
        sessionID: input.sessionID,
        projectRoot: root,
        projectSubpath: subpath,
        profile,
        mode: input.config.architectureMode,
    });
    return renderToolkitStatus({ profile, state, config: input.config });
}
//# sourceMappingURL=toolkit-status.js.map
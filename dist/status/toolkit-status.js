import { formatTimestamp } from "../metrics/format.js";
import { cacheSessionState, loadPersistedSessionState } from "../routing/persistence.js";
import { createSessionState } from "../routing/state.js";
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
        ...state.unactivatedSkills.map((skill) => skill.reason),
    ];
    return [...new Set(reasons)];
}
function verificationLine(verification) {
    if (!verification || verification.runs === 0 || !verification.lastRunAt) {
        return "  Verify: not run yet";
    }
    return `  Verify: last run ${formatTimestamp(verification.lastRunAt)} — ${verification.lastStatus ?? "unknown"} (${verification.runs} run(s), ${verification.findings} finding(s))`;
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
        const awaiting = state.unactivatedSkills
            .filter((skill) => skill.status === "awaiting-approval")
            .map((skill) => skill.id);
        const denied = state.unactivatedSkills
            .filter((skill) => skill.status === "denied")
            .map((skill) => skill.id);
        lines.push(`  Pending: ${list(pending)}`);
        if (awaiting.length)
            lines.push(`  Awaiting approval: ${list(awaiting)}`);
        if (denied.length)
            lines.push(`  Denied: ${list(denied)}`);
        lines.push(`  Dropped: ${state.droppedSkills.length
            ? state.droppedSkills.map((drop) => `${drop.id} (${drop.reason})`).join(", ")
            : "none"}`);
        lines.push(`  Reasons: ${list(reasonsFor(state))}`);
    }
    lines.push(`  Mode: ${config.architectureMode} | scan: ${config.architectureScan} | announce: ${config.announceSelections}`);
    lines.push(verificationLine(input.verification));
    return lines.join("\n");
}
export async function buildCurrentStatusSnapshot(ctx, input) {
    const session = await ctx.session
        .get({ sessionID: input.sessionID })
        .catch(() => null);
    const root = session?.location?.directory;
    if (!root) {
        return renderToolkitStatus({
            profile: null,
            state: null,
            config: input.config,
            verification: null,
        });
    }
    const subpath = session?.subpath ?? null;
    const profile = await input.profileCache.resolve(root, subpath);
    // A read-only diagnostic must not create or cache routing state on disk;
    // it hydrates the persisted state (caching the hit) or renders a fresh
    // transient view of what an untracked session would look like.
    const cached = input.sessions.get(input.sessionID);
    let state = cached && cached.projectRoot === root && cached.projectSubpath === subpath
        ? cached
        : undefined;
    if (!state) {
        const hydrated = await loadPersistedSessionState(ctx.storage, input.sessionID);
        if (hydrated && hydrated.projectRoot === root && hydrated.projectSubpath === subpath) {
            cacheSessionState(input.sessions, hydrated);
            // Keep the context hook pointing at the same object the event handlers
            // will mutate after a cache eviction or restart.
            input.renderContexts?.syncState(input.sessionID, hydrated);
            state = hydrated;
        }
    }
    const view = state ??
        createSessionState({
            sessionID: input.sessionID,
            projectRoot: root,
            projectSubpath: subpath,
            profile,
            mode: input.config.architectureMode,
        });
    return renderToolkitStatus({
        profile,
        state: view,
        config: input.config,
        verification: (await input.verificationFor?.(root)) ?? null,
    });
}
//# sourceMappingURL=toolkit-status.js.map
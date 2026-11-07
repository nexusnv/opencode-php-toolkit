import { SKILL_IDS } from "../content.js";
import { classify } from "./classifier.js";
import { applyPermissionsEvent } from "./events.js";
import { effectiveSkillPermission, filterByPermission } from "./permissions.js";
import { loadOrCreateState, persistStorageState } from "./persistence.js";
import { selectSkills } from "./selector.js";
import { applyTaskBoundary, markAttached, markDenied, } from "./state.js";
import { transitionTask } from "./task-boundary.js";
export async function runRoutingSafely(run, explicit = []) {
    try {
        const result = await run();
        return { explicit: result.explicit, attach: result.attach };
    }
    catch (err) {
        return { explicit, attach: [], error: err.message };
    }
}
export async function runRouting(ctx, input, config, profileCache, sessions, contentLengths, availableSkills, renderContexts, metrics) {
    const session = await ctx.session.get({ sessionID: input.sessionID });
    const root = session?.location?.directory ?? ctx.location.directory;
    const subpath = session?.subpath ?? null;
    const profile = await profileCache.resolve(root, subpath);
    const loaded = await loadOrCreateState(ctx.storage, sessions, {
        sessionID: input.sessionID,
        projectRoot: root,
        projectSubpath: subpath,
        profile,
        mode: config.architectureMode,
    });
    const state = loaded.state;
    const current = classify({
        prompt: input.text,
        files: input.files,
        agent: session?.agent ?? null,
        profile,
        state,
        architectureMode: config.architectureMode,
    });
    // A non-PHP prompt must not advance the generation or inherit PHP concerns.
    // Drop the cached render context too: the request must not inject a stale
    // task part for work the user has moved on from.
    if (!current.phpContext) {
        renderContexts.clear(input.sessionID);
        return {
            explicit: input.skills,
            attach: [],
            profile,
            state,
            reasons: current.reasonCodes,
        };
    }
    const boundary = transitionTask({
        prompt: input.text,
        current,
        active: state,
        files: input.files,
        agent: session?.agent ?? null,
        now: Date.now(),
    });
    const withTask = applyTaskBoundary(state, boundary, profile);
    // Reconcile stored permission statuses with the current snapshot before
    // selection: a permissions event missed during a restart must not leave a
    // now-allowed skill suppressed for the rest of the task.
    const rules = session?.permissions ?? [];
    applyPermissionsEvent(withTask, rules);
    const deniedSkills = new Set(SKILL_IDS.filter((id) => effectiveSkillPermission(rules, id) === "denied"));
    const selection = selectSkills({
        prompt: input.text,
        intents: withTask.activeIntents,
        concerns: withTask.activeConcerns,
        maintainSubtype: withTask.maintainSubtype,
        questionForm: current.questionForm,
        explicit: input.skills,
        activated: withTask.activatedSkills,
        unactivated: withTask.unactivatedSkills,
        config: { maxSkills: config.maxSkills, maxSkillChars: config.maxSkillChars },
        contentLengths,
        available: availableSkills,
        denied: deniedSkills,
        scores: current.scores,
        agentDefault: null,
    });
    const explicitIDs = new Set(input.skills.map((skill) => skill.id));
    const permissioned = filterByPermission(selection, session?.permissions ?? [], explicitIDs);
    if (!session?.location?.directory)
        permissioned.reasonCodes.push("profile:root-fallback");
    const attach = config.autoSkills === "attach" ? permissioned.attach : [];
    if (config.autoSkills !== "attach") {
        permissioned.reasonCodes.push(`config:auto-skills-${config.autoSkills}`);
    }
    for (const item of permissioned.explicitStatuses) {
        if (item.status === "denied")
            markDenied(withTask, item.id);
        else
            markAttached(withTask, [item.id], item.status);
    }
    for (const item of permissioned.deniedRouter)
        markDenied(withTask, item.id);
    // Skills denied before they reached the attach list are dropped by the
    // selector; persist their denied status too so later prompts respect it.
    for (const item of permissioned.dropped) {
        if (item.reason === "permission:denied")
            markDenied(withTask, item.id);
    }
    for (const item of attach)
        markAttached(withTask, [item.id], item.status);
    withTask.selectedSkills = config.autoSkills === "off" ? [] : permissioned.selected;
    withTask.droppedSkills = config.autoSkills === "off" ? [] : permissioned.dropped;
    withTask.lastPromptAt = Date.now();
    renderContexts.set(input.sessionID, {
        profile,
        state: withTask,
        boundaryMode: boundary.mode,
    });
    try {
        if (loaded.readFailed) {
            console.warn("[php-toolkit] routing state read failed; leaving persisted session state untouched");
        }
        else {
            await persistStorageState(ctx.storage, withTask);
        }
    }
    catch (err) {
        console.error(`[php-toolkit] routing persistence failed: ${err.message}`);
    }
    try {
        await recordRoutingMetrics(metrics, current, boundary, {
            ...permissioned,
            selected: config.autoSkills === "off" ? [] : permissioned.selected,
            dropped: config.autoSkills === "off" ? [] : permissioned.dropped,
            attach,
        }, root);
    }
    catch (err) {
        console.error(`[php-toolkit] routing metrics failed: ${err.message}`);
    }
    return {
        explicit: input.skills,
        attach: attach.map(({ id }) => ({ id })),
        profile,
        state: withTask,
        reasons: permissioned.reasonCodes,
    };
}
async function recordRoutingMetrics(metrics, current, boundary, selection, projectRoot) {
    if (current.intents.length) {
        await metrics.recordRouting({ kind: "intents", values: current.intents }, projectRoot);
    }
    if (current.concerns.length) {
        await metrics.recordRouting({ kind: "concerns", values: current.concerns }, projectRoot);
    }
    for (const id of selection.selected) {
        await metrics.recordRouting({ kind: "selected", skill: id }, projectRoot);
    }
    for (const item of selection.attach) {
        if (item.status === "pending") {
            await metrics.recordRouting({ kind: "unactivated", skill: item.id }, projectRoot);
        }
    }
    for (const drop of selection.dropped) {
        await metrics.recordRouting({ kind: "dropped", reason: drop.reason }, projectRoot);
    }
    if (boundary.reset) {
        await metrics.recordRouting({ kind: "task-generation" }, projectRoot);
        // `resets` counts only explicit task switches; new tasks from staleness
        // or strong-intent boundaries are counted as generations, not resets.
        if (boundary.mode === "reset") {
            await metrics.recordRouting({ kind: "reset" }, projectRoot);
        }
    }
    else if (boundary.mode === "continuation" ||
        boundary.mode === "ambiguous-continuation") {
        await metrics.recordRouting({ kind: "continuation" }, projectRoot);
    }
}
//# sourceMappingURL=orchestrator.js.map
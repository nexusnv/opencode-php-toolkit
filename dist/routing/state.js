export function createSessionState(input) {
    const now = input.now ?? Date.now();
    return {
        sessionID: input.sessionID,
        projectRoot: input.projectRoot,
        projectSubpath: input.projectSubpath,
        projectFingerprint: input.profile?.fingerprint ?? "",
        projectLockFingerprint: input.profile?.lockFingerprint ?? null,
        taskGeneration: 0,
        taskStartedAt: now,
        previousTask: null,
        activeIntents: [],
        activeConcerns: [],
        maintainSubtype: null,
        selectedSkills: [],
        attachedSkills: [],
        activatedSkills: new Set(),
        unactivatedSkills: [],
        droppedSkills: [],
        mode: input.mode ?? "risk",
        lastPromptAt: 0,
        lastAnnouncement: null,
        verification: { lastRunAt: null, status: null, failedChecks: [] },
    };
}
function unactivatedReason(status) {
    return status === "pending" ? "activation:not-confirmed" : `permission:${status}`;
}
export function markAttached(state, ids, status = "pending") {
    for (const id of ids) {
        if (state.activatedSkills.has(id))
            continue;
        if (!state.attachedSkills.includes(id))
            state.attachedSkills.push(id);
        const existing = state.unactivatedSkills.find((skill) => skill.id === id);
        if (existing) {
            existing.attempts += 1;
            existing.status = status;
            existing.reason = unactivatedReason(status);
        }
        else {
            state.unactivatedSkills.push({
                id,
                attempts: 1,
                status,
                reason: unactivatedReason(status),
            });
        }
    }
}
export function markActivated(state, id) {
    state.activatedSkills.add(id);
    state.unactivatedSkills = state.unactivatedSkills.filter((skill) => skill.id !== id);
    if (!state.attachedSkills.includes(id))
        state.attachedSkills.push(id);
}
export function markDenied(state, id, reason = "permission:denied") {
    const existing = state.unactivatedSkills.find((skill) => skill.id === id);
    if (existing) {
        existing.status = "denied";
        existing.reason = reason;
    }
    else {
        state.unactivatedSkills.push({ id, attempts: 1, status: "denied", reason });
    }
}
export function applyTaskBoundary(state, boundary, profile) {
    state.taskGeneration = boundary.taskGeneration;
    state.taskStartedAt = boundary.taskStartedAt;
    state.previousTask = boundary.previousTask;
    state.activeIntents = [...boundary.intents];
    state.activeConcerns = [...boundary.concerns];
    state.maintainSubtype = boundary.maintainSubtype;
    state.projectFingerprint = profile.fingerprint;
    state.projectLockFingerprint = profile.lockFingerprint;
    if (boundary.reset) {
        for (const skill of state.unactivatedSkills) {
            if (skill.status === "pending")
                skill.attempts = 0;
        }
        state.droppedSkills = [];
    }
    return state;
}
const renderContexts = new Map();
export function setRoutingRenderContext(sessionID, value) {
    renderContexts.set(sessionID, value);
}
export function getRoutingRenderContext(sessionID) {
    return renderContexts.get(sessionID);
}
export function clearRoutingRenderContext(sessionID) {
    renderContexts.delete(sessionID);
}
//# sourceMappingURL=state.js.map
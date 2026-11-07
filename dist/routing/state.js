import { MAX_UNACTIVATED_ATTEMPTS } from "./types.js";
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
        activeFiles: [],
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
            existing.attempts = Math.min(existing.attempts + 1, MAX_UNACTIVATED_ATTEMPTS);
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
    state.activeFiles = [...boundary.activeFiles];
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
const MAX_ROUTING_CONTEXTS = 100;
/**
 * Render contexts belong to one plugin setup. A module-level map would leak
 * state between plugin instances in the same process, so each setup owns an
 * instance and disposes only its own entries.
 */
export class RoutingRenderContexts {
    #items = new Map();
    #max;
    constructor(max = MAX_ROUTING_CONTEXTS) {
        this.#max = max;
    }
    set(sessionID, value) {
        // Re-insert to move the entry to the end of the LRU, then evict the oldest.
        if (this.#items.has(sessionID))
            this.#items.delete(sessionID);
        this.#items.set(sessionID, value);
        while (this.#items.size > this.#max) {
            const oldest = this.#items.keys().next().value;
            if (oldest === undefined)
                break;
            this.#items.delete(oldest);
        }
    }
    get(sessionID) {
        return this.#items.get(sessionID);
    }
    /** Points an existing context at a re-hydrated state object. */
    syncState(sessionID, state) {
        const current = this.#items.get(sessionID);
        if (current)
            this.#items.set(sessionID, { ...current, state });
    }
    clear(sessionID) {
        this.#items.delete(sessionID);
    }
    clearAll() {
        this.#items.clear();
    }
}
//# sourceMappingURL=state.js.map
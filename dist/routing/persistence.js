import { CONCERNS, INTENTS } from "./types.js";
import { createSessionState } from "./state.js";
export const SESSION_STORAGE_PREFIX = "php-toolkit:session:";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value) {
    return typeof value === "string";
}
function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function isStringArray(value) {
    return Array.isArray(value) && value.every(isString);
}
function isIntent(value) {
    return isString(value) && INTENTS.includes(value);
}
function isConcern(value) {
    return isString(value) && CONCERNS.includes(value);
}
function isIntentArray(value) {
    return Array.isArray(value) && value.every(isIntent);
}
function isConcernArray(value) {
    return Array.isArray(value) && value.every(isConcern);
}
const UNACTIVATED_STATUSES = [
    "pending",
    "awaiting-approval",
    "denied",
];
const VERIFICATION_STATUSES = [
    "passed",
    "failed",
    "partial",
    "unavailable",
    "error",
];
function parsePreviousTask(value) {
    if (value === null)
        return { ok: true, value: null };
    if (!isRecord(value))
        return { ok: false };
    if (!isNumber(value.generation) || !isIntentArray(value.intents) || !isConcernArray(value.concerns)) {
        return { ok: false };
    }
    return {
        ok: true,
        value: {
            generation: value.generation,
            intents: [...value.intents],
            concerns: [...value.concerns],
        },
    };
}
function parseUnactivatedSkills(value) {
    if (!Array.isArray(value))
        return null;
    const out = [];
    for (const entry of value) {
        if (!isRecord(entry))
            return null;
        if (!isString(entry.id) ||
            !isNumber(entry.attempts) ||
            !isString(entry.reason) ||
            !isString(entry.status) ||
            !UNACTIVATED_STATUSES.includes(entry.status)) {
            return null;
        }
        out.push({
            id: entry.id,
            attempts: entry.attempts,
            status: entry.status,
            reason: entry.reason,
        });
    }
    return out;
}
function parseDroppedSkills(value) {
    if (!Array.isArray(value))
        return null;
    const out = [];
    for (const entry of value) {
        if (!isRecord(entry) || !isString(entry.id) || !isString(entry.reason))
            return null;
        out.push({ id: entry.id, reason: entry.reason });
    }
    return out;
}
function parseVerification(value) {
    if (!isRecord(value))
        return null;
    const lastRunAt = value.lastRunAt;
    const status = value.status;
    if (!(lastRunAt === null || isString(lastRunAt)))
        return null;
    if (!(status === null ||
        (isString(status) && VERIFICATION_STATUSES.includes(status)))) {
        return null;
    }
    if (!isStringArray(value.failedChecks))
        return null;
    return {
        lastRunAt,
        status: status,
        failedChecks: [...value.failedChecks],
    };
}
export function serializeStorageState(state) {
    return {
        schemaVersion: 1,
        sessionID: state.sessionID,
        projectRoot: state.projectRoot,
        projectSubpath: state.projectSubpath,
        projectFingerprint: state.projectFingerprint,
        projectLockFingerprint: state.projectLockFingerprint,
        taskGeneration: state.taskGeneration,
        taskStartedAt: state.taskStartedAt,
        previousTask: state.previousTask
            ? {
                generation: state.previousTask.generation,
                intents: [...state.previousTask.intents],
                concerns: [...state.previousTask.concerns],
            }
            : null,
        activeIntents: [...state.activeIntents],
        activeConcerns: [...state.activeConcerns],
        selectedSkills: [...state.selectedSkills],
        attachedSkills: [...state.attachedSkills],
        activatedSkills: [...state.activatedSkills],
        unactivatedSkills: state.unactivatedSkills.map((skill) => ({ ...skill })),
        droppedSkills: state.droppedSkills.map((skill) => ({ ...skill })),
        mode: state.mode,
        lastPromptAt: state.lastPromptAt,
        lastAnnouncement: state.lastAnnouncement,
        verification: {
            lastRunAt: state.verification.lastRunAt,
            status: state.verification.status,
            failedChecks: [...state.verification.failedChecks],
        },
    };
}
export function hydrateStorageState(raw) {
    if (!isRecord(raw) || raw.schemaVersion !== 1)
        return null;
    if (!isString(raw.sessionID) || !isString(raw.projectRoot))
        return null;
    if (!(raw.projectSubpath === null || isString(raw.projectSubpath)))
        return null;
    if (!isString(raw.projectFingerprint))
        return null;
    if (!(raw.projectLockFingerprint === null || isString(raw.projectLockFingerprint)))
        return null;
    if (!isNumber(raw.taskGeneration) || !isNumber(raw.taskStartedAt) || !isNumber(raw.lastPromptAt)) {
        return null;
    }
    if (!(raw.mode === "risk" || raw.mode === "strict" || raw.mode === "off"))
        return null;
    if (!(raw.lastAnnouncement === null || isString(raw.lastAnnouncement)))
        return null;
    const previousTask = parsePreviousTask(raw.previousTask);
    if (!previousTask.ok)
        return null;
    if (!isIntentArray(raw.activeIntents) ||
        !isConcernArray(raw.activeConcerns) ||
        !isStringArray(raw.selectedSkills) ||
        !isStringArray(raw.attachedSkills) ||
        !isStringArray(raw.activatedSkills)) {
        return null;
    }
    const unactivatedSkills = parseUnactivatedSkills(raw.unactivatedSkills);
    const droppedSkills = parseDroppedSkills(raw.droppedSkills);
    const verification = parseVerification(raw.verification);
    if (!unactivatedSkills || !droppedSkills || !verification)
        return null;
    return {
        sessionID: raw.sessionID,
        projectRoot: raw.projectRoot,
        projectSubpath: raw.projectSubpath,
        projectFingerprint: raw.projectFingerprint,
        projectLockFingerprint: raw.projectLockFingerprint,
        taskGeneration: raw.taskGeneration,
        taskStartedAt: raw.taskStartedAt,
        previousTask: previousTask.value,
        activeIntents: [...raw.activeIntents],
        activeConcerns: [...raw.activeConcerns],
        selectedSkills: [...raw.selectedSkills],
        attachedSkills: [...raw.attachedSkills],
        activatedSkills: new Set(raw.activatedSkills),
        unactivatedSkills,
        droppedSkills,
        mode: raw.mode,
        lastPromptAt: raw.lastPromptAt,
        lastAnnouncement: raw.lastAnnouncement,
        verification,
    };
}
export async function loadOrCreateState(storage, sessions, input) {
    const key = `${SESSION_STORAGE_PREFIX}${input.sessionID}`;
    const cached = sessions.get(input.sessionID);
    if (cached &&
        cached.projectRoot === input.projectRoot &&
        cached.projectSubpath === input.projectSubpath) {
        return cached;
    }
    let raw;
    try {
        raw = await storage.get(key);
    }
    catch (err) {
        console.warn(`[php-toolkit] session state read failed: ${err.message}`);
        raw = undefined;
    }
    const hydrated = hydrateStorageState(raw);
    if (hydrated &&
        hydrated.sessionID === input.sessionID &&
        hydrated.projectRoot === input.projectRoot &&
        hydrated.projectSubpath === input.projectSubpath) {
        sessions.set(input.sessionID, hydrated);
        return hydrated;
    }
    const created = createSessionState(input);
    sessions.set(input.sessionID, created);
    return created;
}
export async function persistStorageState(storage, state) {
    await storage.set(`${SESSION_STORAGE_PREFIX}${state.sessionID}`, serializeStorageState(state));
}
//# sourceMappingURL=persistence.js.map
import { CONCERNS, INTENTS, MAX_PATH_LENGTH, MAX_UNACTIVATED_ATTEMPTS } from "./types.js";
import { createSessionState } from "./state.js";
export const SESSION_STORAGE_PREFIX = "php-toolkit:session:";
export const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_CACHED_SESSIONS = 100;
const MAX_ARRAY_ITEMS = 256;
const MAX_ENUM_ITEMS = 16;
const MAX_ID_LENGTH = 128;
const MAX_REASON_LENGTH = 256;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
const pendingWrites = new Map();
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value) {
    return typeof value === "string";
}
function isStringAtMost(value, maxLength) {
    return isString(value) && value.length <= maxLength;
}
function isNonNegativeInteger(value, max = MAX_COUNTER) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}
function isStringArray(value, maxLength = MAX_REASON_LENGTH, maxItems = MAX_ARRAY_ITEMS) {
    return (Array.isArray(value) &&
        value.length <= maxItems &&
        value.every((entry) => isStringAtMost(entry, maxLength)));
}
function isIDArray(value) {
    return isStringArray(value, MAX_ID_LENGTH, MAX_ARRAY_ITEMS);
}
function isIntent(value) {
    return isString(value) && INTENTS.includes(value);
}
function isConcern(value) {
    return isString(value) && CONCERNS.includes(value);
}
function isIntentArray(value) {
    return Array.isArray(value) && value.length <= MAX_ENUM_ITEMS && value.every(isIntent);
}
function isConcernArray(value) {
    return Array.isArray(value) && value.length <= MAX_ENUM_ITEMS && value.every(isConcern);
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
    if (!isNonNegativeInteger(value.generation) || !isIntentArray(value.intents) || !isConcernArray(value.concerns)) {
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
function parseMaintainSubtype(value) {
    if (value === undefined || value === null)
        return { ok: true, value: null };
    if (value === "modernization" || value === "dependency" || value === "refactor") {
        return { ok: true, value };
    }
    return { ok: false };
}
function parseUnactivatedSkills(value) {
    if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS)
        return null;
    const out = [];
    for (const entry of value) {
        if (!isRecord(entry))
            return null;
        if (!isStringAtMost(entry.id, MAX_ID_LENGTH) ||
            !isNonNegativeInteger(entry.attempts, MAX_UNACTIVATED_ATTEMPTS) ||
            !isStringAtMost(entry.reason, MAX_REASON_LENGTH) ||
            !isStringAtMost(entry.status, 32) ||
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
    if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS)
        return null;
    const out = [];
    for (const entry of value) {
        if (!isRecord(entry) ||
            !isStringAtMost(entry.id, MAX_ID_LENGTH) ||
            !isStringAtMost(entry.reason, MAX_REASON_LENGTH)) {
            return null;
        }
        out.push({ id: entry.id, reason: entry.reason });
    }
    return out;
}
function parseVerification(value) {
    if (!isRecord(value))
        return null;
    const lastRunAt = value.lastRunAt;
    const status = value.status;
    if (!(lastRunAt === null || isStringAtMost(lastRunAt, 64)))
        return null;
    if (!(status === null ||
        (isStringAtMost(status, 32) &&
            VERIFICATION_STATUSES.includes(status)))) {
        return null;
    }
    if (!isStringArray(value.failedChecks, 256, 64))
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
        activeFiles: [...state.activeFiles],
        activeIntents: [...state.activeIntents],
        activeConcerns: [...state.activeConcerns],
        maintainSubtype: state.maintainSubtype,
        selectedSkills: [...state.selectedSkills],
        attachedSkills: [...state.attachedSkills],
        activatedSkills: [...state.activatedSkills],
        unactivatedSkills: state.unactivatedSkills.map((skill) => ({
            ...skill,
            attempts: Math.min(skill.attempts, MAX_UNACTIVATED_ATTEMPTS),
        })),
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
    if (!isStringAtMost(raw.sessionID, 512) || !isStringAtMost(raw.projectRoot, MAX_PATH_LENGTH))
        return null;
    if (!(raw.projectSubpath === null || isStringAtMost(raw.projectSubpath, MAX_PATH_LENGTH))) {
        return null;
    }
    if (!isStringAtMost(raw.projectFingerprint, 128))
        return null;
    if (!(raw.projectLockFingerprint === null || isStringAtMost(raw.projectLockFingerprint, 128))) {
        return null;
    }
    if (!isNonNegativeInteger(raw.taskGeneration) || !isNonNegativeInteger(raw.taskStartedAt) || !isNonNegativeInteger(raw.lastPromptAt)) {
        return null;
    }
    if (!(raw.mode === "risk" || raw.mode === "strict" || raw.mode === "off"))
        return null;
    if (!(raw.lastAnnouncement === null || isStringAtMost(raw.lastAnnouncement, MAX_REASON_LENGTH))) {
        return null;
    }
    const previousTask = parsePreviousTask(raw.previousTask);
    if (!previousTask.ok)
        return null;
    const maintainSubtype = parseMaintainSubtype(raw.maintainSubtype);
    if (!maintainSubtype.ok)
        return null;
    if (!isIntentArray(raw.activeIntents) ||
        !isConcernArray(raw.activeConcerns) ||
        !isIDArray(raw.selectedSkills) ||
        !isIDArray(raw.attachedSkills) ||
        !isIDArray(raw.activatedSkills)) {
        return null;
    }
    // Older documents predate active-file tracking; an absent value means "none".
    const activeFiles = raw.activeFiles === undefined
        ? []
        : isStringArray(raw.activeFiles, MAX_PATH_LENGTH, MAX_ARRAY_ITEMS)
            ? [...raw.activeFiles]
            : null;
    if (!activeFiles)
        return null;
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
        activeFiles,
        activeIntents: [...raw.activeIntents],
        activeConcerns: [...raw.activeConcerns],
        maintainSubtype: maintainSubtype.value,
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
function evictOldestSession(sessions) {
    if (sessions.size <= MAX_CACHED_SESSIONS)
        return;
    let oldestKey;
    let oldestTouched = Number.POSITIVE_INFINITY;
    for (const [key, state] of sessions) {
        const touched = state.lastPromptAt > 0 ? state.lastPromptAt : state.taskStartedAt;
        if (touched < oldestTouched) {
            oldestTouched = touched;
            oldestKey = key;
        }
    }
    if (oldestKey)
        sessions.delete(oldestKey);
}
/** Caches a state and evicts the stalest in-memory entry when full. */
export function cacheSessionState(sessions, state) {
    sessions.set(state.sessionID, state);
    evictOldestSession(sessions);
}
/** Reads persisted routing state without creating a fallback entry. */
export async function readPersistedSessionState(storage, sessionID) {
    try {
        const raw = await storage.get(`${SESSION_STORAGE_PREFIX}${sessionID}`);
        const hydrated = hydrateStorageState(raw);
        return {
            state: hydrated && hydrated.sessionID === sessionID ? hydrated : null,
            readFailed: false,
        };
    }
    catch (err) {
        console.warn(`[php-toolkit] session state read failed: ${err.message}`);
        return { state: null, readFailed: true };
    }
}
export async function loadPersistedSessionState(storage, sessionID) {
    return (await readPersistedSessionState(storage, sessionID)).state;
}
export async function loadOrCreateState(storage, sessions, input) {
    const cached = sessions.get(input.sessionID);
    if (cached &&
        cached.projectRoot === input.projectRoot &&
        cached.projectSubpath === input.projectSubpath) {
        return { state: cached, readFailed: false };
    }
    const read = await readPersistedSessionState(storage, input.sessionID);
    if (read.state &&
        read.state.projectRoot === input.projectRoot &&
        read.state.projectSubpath === input.projectSubpath) {
        cacheSessionState(sessions, read.state);
        return { state: read.state, readFailed: false };
    }
    const created = createSessionState(input);
    // A failed read may be transient; caching or persisting fresh state would
    // replace history that a later successful read could still recover.
    if (!read.readFailed)
        cacheSessionState(sessions, created);
    return { state: created, readFailed: read.readFailed };
}
/** Removes persisted session documents with no prompt activity for the retention window. */
export async function pruneStaleRoutingSessions(storage, now = Date.now(), retentionMs = SESSION_RETENTION_MS) {
    const cutoff = now - retentionMs;
    let removed = 0;
    let after;
    do {
        const page = await storage.scan({
            prefix: SESSION_STORAGE_PREFIX,
            after,
            limit: 100,
        });
        for (const entry of page.entries) {
            const hydrated = hydrateStorageState(entry.value);
            if (!hydrated)
                continue;
            // Staleness is keyed on recent activity, not when the task started:
            // a long-running task with fresh prompts must not be pruned.
            const touched = hydrated.lastPromptAt > 0 ? hydrated.lastPromptAt : hydrated.taskStartedAt;
            if (touched >= cutoff)
                continue;
            // Revalidate immediately before deleting: a prompt may have refreshed
            // the document after the scan page was read. A failed re-read must not
            // delete state that could still be current.
            let current;
            try {
                current = await storage.get(entry.key);
            }
            catch (err) {
                console.warn(`[php-toolkit] could not re-read session state: ${err.message}`);
                continue;
            }
            const latest = hydrateStorageState(current);
            if (!latest)
                continue;
            const latestTouched = latest.lastPromptAt > 0 ? latest.lastPromptAt : latest.taskStartedAt;
            if (latestTouched >= cutoff)
                continue;
            try {
                await storage.remove(entry.key);
                removed += 1;
            }
            catch (err) {
                console.warn(`[php-toolkit] could not remove stale session state: ${err.message}`);
            }
        }
        after = page.next;
    } while (after);
    return removed;
}
export async function persistStorageState(storage, state) {
    const key = `${SESSION_STORAGE_PREFIX}${state.sessionID}`;
    const value = serializeStorageState(state);
    const sessionKey = state.sessionID;
    const previous = pendingWrites.get(sessionKey) ?? Promise.resolve();
    const next = previous.then(() => storage.set(key, value));
    const tracked = next.catch(() => undefined);
    pendingWrites.set(sessionKey, tracked);
    try {
        await next;
    }
    finally {
        if (pendingWrites.get(sessionKey) === tracked)
            pendingWrites.delete(sessionKey);
    }
}
//# sourceMappingURL=persistence.js.map
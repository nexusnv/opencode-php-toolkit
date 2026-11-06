import { CONCERNS, INTENTS } from "./types.js";
import type {
  Concern,
  Intent,
  MaintainSubtype,
  PreviousTask,
  SessionRoutingState,
  SkillUnactivatedStatus,
  StoredSessionRoutingState,
  UnactivatedSkill,
  VerificationStatus,
} from "./types.js";
import { createSessionState, type CreateSessionStateInput } from "./state.js";

export const SESSION_STORAGE_PREFIX = "php-toolkit:session:";
export const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_CACHED_SESSIONS = 100;
const MAX_ARRAY_ITEMS = 256;
const MAX_ENUM_ITEMS = 16;
const MAX_ID_LENGTH = 128;
const MAX_PATH_LENGTH = 4096;
const MAX_REASON_LENGTH = 256;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
const pendingWrites = new Map<string, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringAtMost(value: unknown, maxLength: number): value is string {
  return isString(value) && value.length <= maxLength;
}

function isNonNegativeInteger(
  value: unknown,
  max: number = MAX_COUNTER,
): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function isStringArray(
  value: unknown,
  maxLength = MAX_REASON_LENGTH,
  maxItems = MAX_ARRAY_ITEMS,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((entry) => isStringAtMost(entry, maxLength))
  );
}

function isIDArray(value: unknown): value is string[] {
  return isStringArray(value, MAX_ID_LENGTH, MAX_ARRAY_ITEMS);
}

function isIntent(value: unknown): value is Intent {
  return isString(value) && (INTENTS as readonly string[]).includes(value);
}

function isConcern(value: unknown): value is Concern {
  return isString(value) && (CONCERNS as readonly string[]).includes(value);
}

function isIntentArray(value: unknown): value is Intent[] {
  return Array.isArray(value) && value.length <= MAX_ENUM_ITEMS && value.every(isIntent);
}

function isConcernArray(value: unknown): value is Concern[] {
  return Array.isArray(value) && value.length <= MAX_ENUM_ITEMS && value.every(isConcern);
}

const UNACTIVATED_STATUSES: readonly SkillUnactivatedStatus[] = [
  "pending",
  "awaiting-approval",
  "denied",
];

const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  "passed",
  "failed",
  "partial",
  "unavailable",
  "error",
];

function parsePreviousTask(value: unknown): { ok: true; value: PreviousTask | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (!isRecord(value)) return { ok: false };
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

function parseMaintainSubtype(
  value: unknown,
): { ok: true; value: MaintainSubtype | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (value === "modernization" || value === "dependency" || value === "refactor") {
    return { ok: true, value };
  }
  return { ok: false };
}

function parseUnactivatedSkills(value: unknown): UnactivatedSkill[] | null {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return null;
  const out: UnactivatedSkill[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (
      !isStringAtMost(entry.id, MAX_ID_LENGTH) ||
      !isNonNegativeInteger(entry.attempts, 1_000) ||
      !isStringAtMost(entry.reason, MAX_REASON_LENGTH) ||
      !isStringAtMost(entry.status, 32) ||
      !(UNACTIVATED_STATUSES as readonly string[]).includes(entry.status)
    ) {
      return null;
    }
    out.push({
      id: entry.id,
      attempts: entry.attempts,
      status: entry.status as SkillUnactivatedStatus,
      reason: entry.reason,
    });
  }
  return out;
}

function parseDroppedSkills(value: unknown): Array<{ id: string; reason: string }> | null {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return null;
  const out: Array<{ id: string; reason: string }> = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !isStringAtMost(entry.id, MAX_ID_LENGTH) ||
      !isStringAtMost(entry.reason, MAX_REASON_LENGTH)
    ) {
      return null;
    }
    out.push({ id: entry.id, reason: entry.reason });
  }
  return out;
}

function parseVerification(
  value: unknown,
): SessionRoutingState["verification"] | null {
  if (!isRecord(value)) return null;
  const lastRunAt = value.lastRunAt;
  const status = value.status;
  if (!(lastRunAt === null || isStringAtMost(lastRunAt, 64))) return null;
  if (
    !(
      status === null ||
      (isStringAtMost(status, 32) &&
        (VERIFICATION_STATUSES as readonly string[]).includes(status))
    )
  ) {
    return null;
  }
  if (!isStringArray(value.failedChecks, 256, 64)) return null;
  return {
    lastRunAt,
    status: status as VerificationStatus | null,
    failedChecks: [...value.failedChecks],
  };
}

export function serializeStorageState(state: SessionRoutingState): StoredSessionRoutingState {
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
    maintainSubtype: state.maintainSubtype,
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

export function hydrateStorageState(raw: unknown): SessionRoutingState | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1) return null;
  if (!isStringAtMost(raw.sessionID, 512) || !isStringAtMost(raw.projectRoot, MAX_PATH_LENGTH)) return null;
  if (!(raw.projectSubpath === null || isStringAtMost(raw.projectSubpath, MAX_PATH_LENGTH))) {
    return null;
  }
  if (!isStringAtMost(raw.projectFingerprint, 128)) return null;
  if (!(raw.projectLockFingerprint === null || isStringAtMost(raw.projectLockFingerprint, 128))) {
    return null;
  }
  if (!isNonNegativeInteger(raw.taskGeneration) || !isNonNegativeInteger(raw.taskStartedAt) || !isNonNegativeInteger(raw.lastPromptAt)) {
    return null;
  }
  if (!(raw.mode === "risk" || raw.mode === "strict" || raw.mode === "off")) return null;
  if (!(raw.lastAnnouncement === null || isStringAtMost(raw.lastAnnouncement, MAX_REASON_LENGTH))) {
    return null;
  }

  const previousTask = parsePreviousTask(raw.previousTask);
  if (!previousTask.ok) return null;

  const maintainSubtype = parseMaintainSubtype(raw.maintainSubtype);
  if (!maintainSubtype.ok) return null;

  if (
    !isIntentArray(raw.activeIntents) ||
    !isConcernArray(raw.activeConcerns) ||
    !isIDArray(raw.selectedSkills) ||
    !isIDArray(raw.attachedSkills) ||
    !isIDArray(raw.activatedSkills)
  ) {
    return null;
  }

  const unactivatedSkills = parseUnactivatedSkills(raw.unactivatedSkills);
  const droppedSkills = parseDroppedSkills(raw.droppedSkills);
  const verification = parseVerification(raw.verification);
  if (!unactivatedSkills || !droppedSkills || !verification) return null;

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

function evictOldestSession(sessions: Map<string, SessionRoutingState>): void {
  if (sessions.size <= MAX_CACHED_SESSIONS) return;
  let oldestKey: string | undefined;
  let oldestTouched = Number.POSITIVE_INFINITY;
  for (const [key, state] of sessions) {
    const touched =
      state.lastPromptAt > 0 ? state.lastPromptAt : state.taskStartedAt;
    if (touched < oldestTouched) {
      oldestTouched = touched;
      oldestKey = key;
    }
  }
  if (oldestKey) sessions.delete(oldestKey);
}

/** Caches a state and evicts the stalest in-memory entry when full. */
export function cacheSessionState(
  sessions: Map<string, SessionRoutingState>,
  state: SessionRoutingState,
): void {
  sessions.set(state.sessionID, state);
  evictOldestSession(sessions);
}

/** Reads persisted routing state without creating a fallback entry. */
export async function loadPersistedSessionState(
  storage: { get(key: string): Promise<unknown> },
  sessionID: string,
): Promise<SessionRoutingState | null> {
  try {
    const raw = await storage.get(`${SESSION_STORAGE_PREFIX}${sessionID}`);
    const hydrated = hydrateStorageState(raw);
    return hydrated && hydrated.sessionID === sessionID ? hydrated : null;
  } catch (err) {
    console.warn(`[php-toolkit] session state read failed: ${(err as Error).message}`);
    return null;
  }
}

export async function loadOrCreateState(
  storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> },
  sessions: Map<string, SessionRoutingState>,
  input: CreateSessionStateInput,
): Promise<SessionRoutingState> {
  const cached = sessions.get(input.sessionID);
  if (
    cached &&
    cached.projectRoot === input.projectRoot &&
    cached.projectSubpath === input.projectSubpath
  ) {
    return cached;
  }

  const hydrated = await loadPersistedSessionState(storage, input.sessionID);
  if (
    hydrated &&
    hydrated.projectRoot === input.projectRoot &&
    hydrated.projectSubpath === input.projectSubpath
  ) {
    cacheSessionState(sessions, hydrated);
    return hydrated;
  }

  const created = createSessionState(input);
  cacheSessionState(sessions, created);
  return created;
}

export interface SessionPruneStorage {
  scan(options: { prefix: string; after?: string; limit?: number }): Promise<{
    entries: ReadonlyArray<{ key: string; value: unknown }>;
    next?: string;
  }>;
  remove(key: string): Promise<void>;
}

/** Removes persisted session documents with no prompt activity for the retention window. */
export async function pruneStaleRoutingSessions(
  storage: SessionPruneStorage,
  now: number = Date.now(),
  retentionMs: number = SESSION_RETENTION_MS,
): Promise<number> {
  const cutoff = now - retentionMs;
  let removed = 0;
  let after: string | undefined;
  do {
    const page = await storage.scan({
      prefix: SESSION_STORAGE_PREFIX,
      after,
      limit: 100,
    });
    for (const entry of page.entries) {
      const hydrated = hydrateStorageState(entry.value);
      if (!hydrated) continue;
      // Staleness is keyed on recent activity, not when the task started:
      // a long-running task with fresh prompts must not be pruned.
      const touched = hydrated.lastPromptAt > 0 ? hydrated.lastPromptAt : hydrated.taskStartedAt;
      if (touched >= cutoff) continue;
      try {
        await storage.remove(entry.key);
        removed += 1;
      } catch (err) {
        console.warn(`[php-toolkit] could not remove stale session state: ${(err as Error).message}`);
      }
    }
    after = page.next;
  } while (after);
  return removed;
}

export async function persistStorageState(
  storage: { set(key: string, value: unknown): Promise<void> },
  state: SessionRoutingState,
): Promise<void> {
  const key = `${SESSION_STORAGE_PREFIX}${state.sessionID}`;
  const value = serializeStorageState(state);
  const sessionKey = state.sessionID;
  const previous = pendingWrites.get(sessionKey) ?? Promise.resolve();
  const next = previous.then(() => storage.set(key, value));
  const tracked = next.catch(() => undefined);
  pendingWrites.set(sessionKey, tracked);
  try {
    await next;
  } finally {
    if (pendingWrites.get(sessionKey) === tracked) pendingWrites.delete(sessionKey);
  }
}

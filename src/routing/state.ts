import type { ProjectProfile } from "../profile.js";
import type { TaskBoundaryResult } from "./task-boundary.js";
import type {
  SessionRoutingState,
  SkillUnactivatedStatus,
  UnactivatedSkill,
} from "./types.js";

export interface CreateSessionStateInput {
  sessionID: string;
  projectRoot: string;
  projectSubpath: string | null;
  profile?: ProjectProfile;
  mode?: "risk" | "strict" | "off";
  now?: number;
}

export function createSessionState(input: CreateSessionStateInput): SessionRoutingState {
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

function unactivatedReason(status: SkillUnactivatedStatus): string {
  return status === "pending" ? "activation:not-confirmed" : `permission:${status}`;
}

export function markAttached(
  state: SessionRoutingState,
  ids: readonly string[],
  status: SkillUnactivatedStatus = "pending",
): void {
  for (const id of ids) {
    if (state.activatedSkills.has(id)) continue;
    if (!state.attachedSkills.includes(id)) state.attachedSkills.push(id);
    const existing = state.unactivatedSkills.find((skill) => skill.id === id);
    if (existing) {
      existing.attempts += 1;
      existing.status = status;
      existing.reason = unactivatedReason(status);
    } else {
      state.unactivatedSkills.push({
        id,
        attempts: 1,
        status,
        reason: unactivatedReason(status),
      });
    }
  }
}

export function markActivated(state: SessionRoutingState, id: string): void {
  state.activatedSkills.add(id);
  state.unactivatedSkills = state.unactivatedSkills.filter((skill) => skill.id !== id);
  if (!state.attachedSkills.includes(id)) state.attachedSkills.push(id);
}

export function markDenied(
  state: SessionRoutingState,
  id: string,
  reason = "permission:denied",
): void {
  const existing: UnactivatedSkill | undefined = state.unactivatedSkills.find(
    (skill) => skill.id === id,
  );
  if (existing) {
    existing.status = "denied";
    existing.reason = reason;
  } else {
    state.unactivatedSkills.push({ id, attempts: 1, status: "denied", reason });
  }
}

export function applyTaskBoundary(
  state: SessionRoutingState,
  boundary: TaskBoundaryResult,
  profile: ProjectProfile,
): SessionRoutingState {
  state.taskGeneration = boundary.taskGeneration;
  state.taskStartedAt = boundary.taskStartedAt;
  state.previousTask = boundary.previousTask;
  state.activeIntents = [...boundary.intents];
  state.activeConcerns = [...boundary.concerns];
  state.projectFingerprint = profile.fingerprint;
  state.projectLockFingerprint = profile.lockFingerprint;
  if (boundary.reset) {
    for (const skill of state.unactivatedSkills) {
      if (skill.status === "pending") skill.attempts = 0;
    }
    state.droppedSkills = [];
  }
  return state;
}

export interface RoutingRenderContext {
  profile: ProjectProfile;
  state: SessionRoutingState;
  boundaryMode?: "continuation" | "ambiguous-continuation" | "new-task" | "reset";
}

const renderContexts = new Map<string, RoutingRenderContext>();

export function setRoutingRenderContext(sessionID: string, value: RoutingRenderContext): void {
  renderContexts.set(sessionID, value);
}

export function getRoutingRenderContext(sessionID: string): RoutingRenderContext | undefined {
  return renderContexts.get(sessionID);
}

export function clearRoutingRenderContext(sessionID: string): void {
  renderContexts.delete(sessionID);
}

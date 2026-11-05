import type { Concern, Intent, PreviousTask } from "./types.js";

/** The subset of SessionRoutingState the boundary machine reads. */
export interface TaskBoundaryState {
  taskGeneration: number;
  taskStartedAt: number;
  activeIntents: Intent[];
  activeConcerns: Concern[];
  previousTask: PreviousTask | null;
}

export interface TaskBoundaryInput {
  prompt: string;
  current: { intents: Intent[]; concerns: Concern[] };
  active: TaskBoundaryState | null;
  files: readonly string[];
  agent: string | null;
  now: number;
}

export interface TaskBoundaryResult {
  reset: boolean;
  taskGeneration: number;
  taskStartedAt: number;
  intents: Intent[];
  concerns: Concern[];
  previousTask: PreviousTask | null;
  mode: "continuation" | "ambiguous-continuation" | "new-task" | "reset";
}

const TASK_SWITCH = /\b(new task|unrelated|switch to|different problem)\b/i;
const CONTINUATION_MARKER =
  /\b(also|now|then|that|it|this|same|continue|next|why)\b|\bfix that\b/i;
const ADDITIONAL_CONCERN = /\b(tests|testing|security|phpstan|standards|performance)\b/i;
const PHP_AGENTS = new Set([
  "php-reviewer",
  "php-debugger",
  "php-modernizer",
  "php-tester",
  "php-architect",
]);

const STALE_TASK_MS = 30 * 60_000;

function snapshot(active: TaskBoundaryState): PreviousTask {
  return {
    generation: active.taskGeneration,
    intents: [...active.activeIntents],
    concerns: [...active.activeConcerns],
  };
}

function union<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

function newTask(
  input: TaskBoundaryInput,
  mode: "new-task" | "reset",
): TaskBoundaryResult {
  const previous = input.active && input.active.taskGeneration > 0 ? snapshot(input.active) : null;
  return {
    reset: true,
    taskGeneration: (input.active?.taskGeneration ?? 0) + 1,
    taskStartedAt: input.now,
    intents: [...input.current.intents],
    concerns: [...input.current.concerns],
    previousTask: previous,
    mode,
  };
}

export function transitionTask(input: TaskBoundaryInput): TaskBoundaryResult {
  const { prompt, current, active, files, agent, now } = input;
  const shortPrompt = prompt.trim().split(/\s+/).filter(Boolean).length <= 12;
  const hasStrongIntent = current.intents.length > 0;
  const continuationMarker = CONTINUATION_MARKER.test(prompt);
  const sameScope = files.length > 0 || (agent !== null && PHP_AGENTS.has(agent));

  // 1. Explicit task switch.
  if (TASK_SWITCH.test(prompt)) {
    return newTask(input, "reset");
  }

  // 2. No active task, or a stale task with no continuation marker.
  if (!active || active.taskGeneration === 0) {
    return newTask(input, "new-task");
  }
  if (now - active.taskStartedAt > STALE_TASK_MS && !continuationMarker) {
    return newTask(input, "new-task");
  }

  // 3. Continuation marker with no new strong intent, or with an explicit
  // additional concern.
  if (continuationMarker && (!hasStrongIntent || ADDITIONAL_CONCERN.test(prompt))) {
    return {
      reset: false,
      taskGeneration: active.taskGeneration,
      taskStartedAt: active.taskStartedAt,
      intents: union(active.activeIntents, current.intents),
      concerns: union(active.activeConcerns, current.concerns),
      previousTask: null,
      mode: "continuation",
    };
  }

  // 4. Short prompt in the same scope with no new strong intent.
  if (shortPrompt && !hasStrongIntent && sameScope) {
    return {
      reset: false,
      taskGeneration: active.taskGeneration,
      taskStartedAt: active.taskStartedAt,
      intents: union(active.activeIntents, current.intents),
      concerns: union(active.activeConcerns, current.concerns),
      previousTask: null,
      mode: "continuation",
    };
  }

  // 5. A new strong intent without a continuation marker starts a new task.
  if (hasStrongIntent && !continuationMarker) {
    return newTask(input, "new-task");
  }

  // 6/7. Short or otherwise ambiguous follow-up: keep the active intent,
  // recompute concerns from the current prompt only.
  return {
    reset: false,
    taskGeneration: active.taskGeneration,
    taskStartedAt: active.taskStartedAt,
    intents: [...active.activeIntents],
    concerns: [...current.concerns],
    previousTask: null,
    mode: "ambiguous-continuation",
  };
}

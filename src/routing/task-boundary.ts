import type { Concern, Intent, MaintainSubtype, PreviousTask } from "./types.js";

/** The subset of SessionRoutingState the boundary machine reads. */
export interface TaskBoundaryState {
  taskGeneration: number;
  taskStartedAt: number;
  activeFiles: string[];
  activeIntents: Intent[];
  activeConcerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  previousTask: PreviousTask | null;
}

export interface TaskBoundaryInput {
  prompt: string;
  current: {
    intents: Intent[];
    concerns: Concern[];
    maintainSubtype: MaintainSubtype | null;
  };
  active: TaskBoundaryState | null;
  files: readonly string[];
  agent: string | null;
  now: number;
}

export interface TaskBoundaryResult {
  reset: boolean;
  taskGeneration: number;
  taskStartedAt: number;
  activeFiles: string[];
  intents: Intent[];
  concerns: Concern[];
  maintainSubtype: MaintainSubtype | null;
  previousTask: PreviousTask | null;
  mode: "continuation" | "ambiguous-continuation" | "new-task" | "reset";
}

const TASK_SWITCH = /\b(new task|unrelated|switch to|different problem)\b/i;
const CONTINUATION_MARKER =
  /\b(also|now|then|that|it|this|same|continue|next|why)\b|\bfix that\b/i;
// Directives that genuinely extend the current task. Demonstrative pronouns
// ("this", "that", "it") can also introduce a new, strongly-typed request such
// as "Refactor this PHP class", so they must not override a new strong intent.
const ADDITIVE_MARKER = /\b(also|now|then|same|continue|next)\b/i;
const ADDITIONAL_CONCERN = /\b(tests|testing|security|phpstan|standards|performance)\b/i;
const PHP_AGENTS = new Set([
  "php-reviewer",
  "php-debugger",
  "php-modernizer",
  "php-tester",
  "php-architect",
]);

const STALE_TASK_MS = 30 * 60_000;
const MAX_ACTIVE_FILES = 64;

function boundedFiles(files: readonly string[]): string[] {
  return [...new Set(files)].slice(0, MAX_ACTIVE_FILES);
}

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

function effectiveMaintainSubtype(
  current: MaintainSubtype | null,
  intents: readonly Intent[],
  active: MaintainSubtype | null,
): MaintainSubtype | null {
  if (current) return current;
  if (intents.includes("Maintain")) return active ?? "refactor";
  return null;
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
    activeFiles: boundedFiles(input.files),
    intents: [...input.current.intents],
    concerns: [...input.current.concerns],
    maintainSubtype: input.current.maintainSubtype,
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

  // 2b. A different attached file is a new task, even for a short prompt:
  // the active task's intents/concerns describe the previous file.
  if (
    files.length > 0 &&
    active.activeFiles.length > 0 &&
    !files.some((file) => active.activeFiles.includes(file))
  ) {
    return newTask(input, "new-task");
  }

  // 3. Continuation marker with no new strong intent, or with an explicit
  // additional concern.
  if (continuationMarker && (!hasStrongIntent || ADDITIONAL_CONCERN.test(prompt))) {
    const intents = union(active.activeIntents, current.intents);
    return {
      reset: false,
      taskGeneration: active.taskGeneration,
      taskStartedAt: active.taskStartedAt,
      activeFiles: boundedFiles([...active.activeFiles, ...files]),
      intents,
      concerns: union(active.activeConcerns, current.concerns),
      maintainSubtype: effectiveMaintainSubtype(
        current.maintainSubtype,
        intents,
        active.maintainSubtype,
      ),
      previousTask: null,
      mode: "continuation",
    };
  }

  // 4. Short prompt in the same scope with no new strong intent.
  if (shortPrompt && !hasStrongIntent && sameScope) {
    const intents = union(active.activeIntents, current.intents);
    return {
      reset: false,
      taskGeneration: active.taskGeneration,
      taskStartedAt: active.taskStartedAt,
      activeFiles: boundedFiles([...active.activeFiles, ...files]),
      intents,
      concerns: union(active.activeConcerns, current.concerns),
      maintainSubtype: effectiveMaintainSubtype(
        current.maintainSubtype,
        intents,
        active.maintainSubtype,
      ),
      previousTask: null,
      mode: "continuation",
    };
  }

  // 5. A new strong intent starts a new task unless a directive marker extends
  // the active task. Incidental pronouns do not override the current intent.
  if (hasStrongIntent && !ADDITIVE_MARKER.test(prompt)) {
    return newTask(input, "new-task");
  }

  // 6/7. Short or otherwise ambiguous follow-up: keep the active intent,
  // recompute concerns from the current prompt only.
  return {
    reset: false,
    taskGeneration: active.taskGeneration,
    taskStartedAt: active.taskStartedAt,
    activeFiles: boundedFiles([...active.activeFiles, ...files]),
    intents: [...active.activeIntents],
    concerns: [...current.concerns],
    maintainSubtype: effectiveMaintainSubtype(
      current.maintainSubtype,
      active.activeIntents,
      active.maintainSubtype,
    ),
    previousTask: null,
    mode: "ambiguous-continuation",
  };
}

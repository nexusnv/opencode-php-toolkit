const TASK_SWITCH = /\b(new task|unrelated|switch to|different problem)\b/i;
const CONTINUATION_MARKER = /\b(also|now|then|that|it|this|same|continue|next|why)\b|\bfix that\b/i;
const ADDITIONAL_CONCERN = /\b(tests|testing|security|phpstan|standards|performance)\b/i;
const PHP_AGENTS = new Set([
    "php-reviewer",
    "php-debugger",
    "php-modernizer",
    "php-tester",
    "php-architect",
]);
const STALE_TASK_MS = 30 * 60_000;
function snapshot(active) {
    return {
        generation: active.taskGeneration,
        intents: [...active.activeIntents],
        concerns: [...active.activeConcerns],
    };
}
function union(a, b) {
    return [...new Set([...a, ...b])];
}
function effectiveMaintainSubtype(current, intents, active) {
    if (current)
        return current;
    if (intents.includes("Maintain"))
        return active ?? "refactor";
    return null;
}
function newTask(input, mode) {
    const previous = input.active && input.active.taskGeneration > 0 ? snapshot(input.active) : null;
    return {
        reset: true,
        taskGeneration: (input.active?.taskGeneration ?? 0) + 1,
        taskStartedAt: input.now,
        intents: [...input.current.intents],
        concerns: [...input.current.concerns],
        maintainSubtype: input.current.maintainSubtype,
        previousTask: previous,
        mode,
    };
}
export function transitionTask(input) {
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
        const intents = union(active.activeIntents, current.intents);
        return {
            reset: false,
            taskGeneration: active.taskGeneration,
            taskStartedAt: active.taskStartedAt,
            intents,
            concerns: union(active.activeConcerns, current.concerns),
            maintainSubtype: effectiveMaintainSubtype(current.maintainSubtype, intents, active.maintainSubtype),
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
            intents,
            concerns: union(active.activeConcerns, current.concerns),
            maintainSubtype: effectiveMaintainSubtype(current.maintainSubtype, intents, active.maintainSubtype),
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
        maintainSubtype: effectiveMaintainSubtype(current.maintainSubtype, active.activeIntents, active.maintainSubtype),
        previousTask: null,
        mode: "ambiguous-continuation",
    };
}
//# sourceMappingURL=task-boundary.js.map
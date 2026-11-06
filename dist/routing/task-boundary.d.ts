import type { Concern, Intent, MaintainSubtype, PreviousTask } from "./types.js";
/** The subset of SessionRoutingState the boundary machine reads. */
export interface TaskBoundaryState {
    taskGeneration: number;
    taskStartedAt: number;
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
    intents: Intent[];
    concerns: Concern[];
    maintainSubtype: MaintainSubtype | null;
    previousTask: PreviousTask | null;
    mode: "continuation" | "ambiguous-continuation" | "new-task" | "reset";
}
export declare function transitionTask(input: TaskBoundaryInput): TaskBoundaryResult;

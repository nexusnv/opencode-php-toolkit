import type { Concern, Intent, MaintainSubtype, Target, UnactivatedSkill } from "./types.js";
export interface SelectorInput {
    prompt: string;
    intents: Intent[];
    concerns: Concern[];
    maintainSubtype: MaintainSubtype | null;
    questionForm: boolean;
    explicit: ReadonlyArray<{
        id: string;
    }>;
    activated: ReadonlySet<string>;
    unactivated: readonly UnactivatedSkill[];
    config: {
        maxSkills: number;
        maxSkillChars: number;
    };
    contentLengths: ReadonlyMap<string, number>;
    /** Skills the host can actually resolve; omitted means no availability filter. */
    available?: ReadonlySet<string>;
    /** Skills denied by the session's current permission snapshot. */
    denied?: ReadonlySet<string>;
    scores?: Partial<Record<Target, number>>;
    agentDefault?: Intent | null;
}
export interface SelectorResult {
    selected: string[];
    attach: Array<{
        id: string;
    }>;
    dropped: Array<{
        id: string;
        reason: string;
    }>;
    reasonCodes: string[];
}
/**
 * Selects the eight Phase 1 skills. Selection is deterministic: explicit
 * skills first, then intent co-skills, then concern skills by score and fixed
 * concern priority, then the remaining budget.
 */
export declare function selectSkills(input: SelectorInput): SelectorResult;

import type { ProjectProfile } from "../profile.js";
import type { ClassificationResult, SessionRoutingState } from "./types.js";
export interface ClassifierInput {
    prompt: string;
    files: readonly string[];
    agent: string | null;
    profile: ProjectProfile | null;
    state: SessionRoutingState | null;
}
export declare function termToRegex(term: string): RegExp;
export declare function normalizePrompt(prompt: string): string;
export declare function stripCodeFences(prompt: string): string;
export declare function classify(input: ClassifierInput): ClassificationResult;

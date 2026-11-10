import type { Concern, Intent, PromotedPattern, Target } from "./types.js";
export interface SignalEntry {
    id: string;
    target: Target;
    weight: 1 | 2 | 3;
    terms: readonly string[];
}
export declare const INTENT_PRIORITY: readonly Intent[];
export declare const CONCERN_PRIORITY: readonly Concern[];
export interface PatternNameSignal {
    name: PromotedPattern;
    term: string;
    weight: 1 | 2 | 3;
}
export declare const PATTERN_NAME_SIGNALS: readonly PatternNameSignal[];
export declare const INTENT_SIGNALS: readonly SignalEntry[];
export declare const CONCERN_SIGNALS: readonly SignalEntry[];

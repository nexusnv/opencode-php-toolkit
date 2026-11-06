import type { Concern, Intent, Target } from "./types.js";
export interface SignalEntry {
    id: string;
    target: Target;
    weight: 1 | 2 | 3;
    terms: readonly string[];
}
export interface FileSignal {
    glob: string;
    target: Target | "*";
    points: 1 | 2;
}
export declare const INTENT_PRIORITY: readonly Intent[];
export declare const CONCERN_PRIORITY: readonly Concern[];
export declare const INTENT_SIGNALS: readonly SignalEntry[];
export declare const CONCERN_SIGNALS: readonly SignalEntry[];
export declare const FILE_SIGNALS: readonly FileSignal[];

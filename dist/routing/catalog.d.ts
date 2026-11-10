import type { PromotedPattern, Target } from "./types.js";
export type CatalogKind = "concern" | "maintain" | "pattern-index" | "pattern-core";
export interface CatalogEntry {
    id: string;
    target: Target;
    order: number;
    kind: CatalogKind;
    pattern?: PromotedPattern;
}
export declare const CATALOG: readonly CatalogEntry[];
export declare const CONCERN_SKILL_BY_TARGET: ReadonlyMap<Target, CatalogEntry>;
export declare const PATTERN_INDEX: CatalogEntry;
export declare const PATTERN_CORE_BY_NAME: ReadonlyMap<PromotedPattern, CatalogEntry>;

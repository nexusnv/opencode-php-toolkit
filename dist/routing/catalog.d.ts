import type { Target } from "./types.js";
export interface CatalogEntry {
    id: string;
    target: Target;
    order: number;
}
export declare const CATALOG: readonly CatalogEntry[];
export declare const CONCERN_SKILL_BY_TARGET: ReadonlyMap<Target, CatalogEntry>;

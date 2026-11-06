import type { Target } from "./types.js";
export type CatalogKind = "concern" | "maintain-coskill";
export interface CatalogEntry {
    id: string;
    target: Target;
    kind: CatalogKind;
    order: number;
}
export declare const CATALOG: readonly CatalogEntry[];
export declare const CATALOG_BY_ID: ReadonlyMap<string, CatalogEntry>;
export declare const CONCERN_SKILL_BY_TARGET: ReadonlyMap<Target, CatalogEntry>;

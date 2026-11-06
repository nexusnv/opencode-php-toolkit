import type { Target } from "./types.js";

export interface CatalogEntry {
  id: string;
  target: Target;
  order: number;
}

// Phase 1 ships concern skills only. The catalog is intentionally small:
// every entry maps exactly one target to exactly one skill.
export const CATALOG: readonly CatalogEntry[] = [
  { id: "php-architecture", target: "Architecture", order: 10 },
  { id: "php-security", target: "Security", order: 20 },
  { id: "php-testing", target: "Testing", order: 30 },
  { id: "php-debug", target: "Debugging", order: 40 },
  { id: "php-static-analysis", target: "Static analysis", order: 50 },
  { id: "php-standards", target: "Coding standards", order: 60 },
  { id: "php-composer", target: "Dependencies", order: 70 },
];

export const CONCERN_SKILL_BY_TARGET: ReadonlyMap<Target, CatalogEntry> = new Map(
  CATALOG.map((entry) => [entry.target, entry]),
);

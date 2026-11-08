import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HIDDEN_SKILL_IDS, PKG_ROOT, SKILL_IDS } from "../src/content.js";
import { CATALOG, PATTERN_CORE_BY_NAME, PATTERN_INDEX } from "../src/routing/catalog.js";

const referenceDir = join(PKG_ROOT, "skills", "php-design-patterns", "references");
const REQUIRED_SECTIONS = [
  "## Problem",
  "## Forces",
  "## Solution (PHP 8.1+)",
  "## Trade-offs",
  "## When not to use",
  "## Testing",
  "## Refactoring path",
  "## Related patterns",
];

function readSkill(id: string): string {
  return readFileSync(join(PKG_ROOT, "skills", id, "SKILL.md"), "utf8");
}

describe("pattern library", () => {
  it("maps every skill ID to a catalog entry and a markdown file", () => {
    const catalogIDs = new Set(CATALOG.map((entry) => entry.id));
    for (const id of SKILL_IDS) {
      expect(catalogIDs.has(id), `${id} missing from CATALOG`).toBe(true);
      expect(existsSync(join(PKG_ROOT, "skills", id, "SKILL.md")), `${id} missing`).toBe(true);
    }
    expect(catalogIDs.size).toBe(CATALOG.length);
  });

  it("keeps the index advertised and every core pattern hidden", () => {
    expect(HIDDEN_SKILL_IDS.has(PATTERN_INDEX.id)).toBe(false);
    for (const entry of PATTERN_CORE_BY_NAME.values()) {
      expect(HIDDEN_SKILL_IDS.has(entry.id)).toBe(true);
    }
    expect([...PATTERN_CORE_BY_NAME.keys()]).toEqual(["strategy", "adapter", "decorator", "state"]);
  });

  it("gives every reference the mandatory sections", () => {
    const files = readdirSync(referenceDir).filter((name) => name.endsWith(".md"));
    expect(files.length).toBeGreaterThanOrEqual(34);
    for (const file of files) {
      const text = readFileSync(join(referenceDir, file), "utf8");
      for (const section of REQUIRED_SECTIONS) {
        expect(text, `${file} missing ${section}`).toContain(section);
      }
    }
  });

  it("gives every core pattern skill the reference sections", () => {
    for (const entry of PATTERN_CORE_BY_NAME.values()) {
      const text = readSkill(entry.id);
      for (const section of REQUIRED_SECTIONS) {
        expect(text, `${entry.id} missing ${section}`).toContain(section);
      }
    }
  });

  it("lists every reference file in the index skill", () => {
    const index = readSkill(PATTERN_INDEX.id);
    const files = readdirSync(referenceDir).filter((name) => name.endsWith(".md"));
    for (const file of files) {
      expect(index, `${file} not linked from the index`).toContain(`references/${file}`);
    }
  });

  it("does not promote Repository in P0", () => {
    expect([...PATTERN_CORE_BY_NAME.keys()]).not.toContain("repository");
    const repository = readFileSync(join(referenceDir, "repository.md"), "utf8");
    expect(repository).toContain("simple persistence service");
  });

  it("keeps pattern catalog orders unique", () => {
    const orders = CATALOG.map((entry) => entry.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

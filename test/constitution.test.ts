import { describe, expect, it } from "vitest";
import { L0_CONSTITUTION } from "../src/constitution.js";

describe("L0 constitution", () => {
  it("contains the mandatory engineering principles and PHP defaults", () => {
    expect(L0_CONSTITUTION).toContain("PHP toolkit engineering principles:");
    expect(L0_CONSTITUTION).toContain("Understand the existing code and conventions");
    expect(L0_CONSTITUTION).toContain("Never invent requirements");
    expect(L0_CONSTITUTION).toContain("PHP 8.1+ defaults:");
    expect(L0_CONSTITUTION).toContain("strict_types=1");
    expect(L0_CONSTITUTION).toContain("Rector and CS-Fixer: dry-run first");
  });

  it("does not contain routing instructions that depend on a skill", () => {
    expect(L0_CONSTITUTION).not.toContain("When you see");
    expect(L0_CONSTITUTION).not.toContain("always use Strategy");
  });
});

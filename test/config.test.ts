import { describe, expect, it } from "vitest";
import { readToolkitConfig } from "../src/config.js";

describe("readToolkitConfig", () => {
  it("uses least-friction defaults", () => {
    expect(readToolkitConfig(undefined)).toEqual({
      autoSkills: "attach",
      maxSkills: 3,
      maxSkillChars: 12000,
      architectureMode: "risk",
      architectureScan: "tool",
      announceSelections: "off",
      verification: "remind",
    });
  });

  it("accepts valid explicit values", () => {
    expect(readToolkitConfig({ autoSkills: "hint", maxSkills: 4 }).autoSkills).toBe("hint");
    expect(readToolkitConfig({ announceSelections: "on-change" }).announceSelections).toBe("on-change");
  });

  it("falls back field-by-field and warns for invalid values", () => {
    const warnings: string[] = [];
    const config = readToolkitConfig(
      { autoSkills: "everything", maxSkills: 99, maxSkillChars: -1 },
      (message) => warnings.push(message),
    );
    expect(config.autoSkills).toBe("attach");
    expect(config.maxSkills).toBe(3);
    expect(config.maxSkillChars).toBe(12000);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("autoSkills off disables routing but not the constitution", () => {
    expect(readToolkitConfig({ autoSkills: "off" }).autoSkills).toBe("off");
  });
});

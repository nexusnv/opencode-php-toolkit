import { describe, expect, it } from "vitest";
import {
  INTENT_SIGNALS,
  CONCERN_SIGNALS,
  INTENT_PRIORITY,
  CONCERN_PRIORITY,
} from "../src/routing/signals.js";

describe("routing dictionary", () => {
  it("contains all specified intent and concern targets", () => {
    expect(new Set(INTENT_SIGNALS.map((s) => s.target))).toEqual(
      new Set(["Build", "Design", "Review", "Debug", "Test", "Maintain"]),
    );
    expect(new Set(CONCERN_SIGNALS.map((s) => s.target))).toEqual(
      new Set([
        "Architecture",
        "Design patterns",
        "Security",
        "Coding standards",
        "Testing",
        "Dependencies",
        "Static analysis",
        "Debugging",
      ]),
    );
  });

  it("keeps exact priority orders", () => {
    expect(INTENT_PRIORITY).toEqual(["Debug", "Review", "Test", "Maintain", "Design", "Build"]);
    expect(CONCERN_PRIORITY).toEqual([
      "Security",
      "Testing",
      "Debugging",
      "Static analysis",
      "Architecture",
      "Design patterns",
      "Coding standards",
      "Dependencies",
    ]);
  });

  it("contains mandatory high-weight signals", () => {
    const terms = new Set([...INTENT_SIGNALS, ...CONCERN_SIGNALS].flatMap((s) => s.terms));
    for (const term of [
      "implement",
      "architecture",
      "security",
      "phpunit",
      "upgrade",
      "sql injection",
      "phpstan",
      "xdebug",
      "coding standard",
    ]) {
      expect(terms.has(term)).toBe(true);
    }
  });

});

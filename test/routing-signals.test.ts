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

  it("keeps mandatory signals at their required target and weight", () => {
    const signals = [...INTENT_SIGNALS, ...CONCERN_SIGNALS];
    const pairsFor = (term: string) =>
      signals
        .filter((entry) => entry.terms.includes(term))
        .map((entry) => `${entry.target}:${entry.weight}`)
        .sort();
    expect(pairsFor("implement")).toEqual(["Build:3"]);
    // The same noun may legitimately score both an intent and a concern.
    expect(pairsFor("architecture")).toEqual(["Architecture:3", "Design:3"]);
    expect(pairsFor("security")).toEqual(["Security:3"]);
    expect(pairsFor("phpunit")).toEqual(["Test:3", "Testing:3"]);
    expect(pairsFor("upgrade")).toEqual(["Maintain:3"]);
    expect(pairsFor("sql injection")).toEqual(["Security:3"]);
    expect(pairsFor("phpstan")).toEqual(["Static analysis:3"]);
    expect(pairsFor("xdebug")).toEqual(["Debugging:3"]);
    expect(pairsFor("coding standard")).toEqual(["Coding standards:3"]);
  });

});

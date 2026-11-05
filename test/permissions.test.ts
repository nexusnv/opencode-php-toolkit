import { describe, expect, it } from "vitest";
import {
  effectiveSkillPermission,
  filterByPermission,
} from "../src/routing/permissions.js";
import type { SelectorResult } from "../src/routing/selector.js";

const rules = [
  { action: "skill", resource: "php-security", effect: "allow" as const },
  { action: "skill", resource: "php-*", effect: "deny" as const },
];

describe("effectiveSkillPermission", () => {
  it("uses the last matching rule", () => {
    expect(effectiveSkillPermission(rules, "php-testing")).toBe("denied");
  });

  it("returns pending when nothing matches", () => {
    expect(effectiveSkillPermission([], "php-testing")).toBe("pending");
  });

  it("ignores unrelated actions", () => {
    expect(
      effectiveSkillPermission([{ action: "tool", resource: "*", effect: "deny" }], "php-testing"),
    ).toBe("pending");
  });

  it("recognizes ask as awaiting approval", () => {
    expect(
      effectiveSkillPermission(
        [{ action: "skill", resource: "php-*", effect: "ask" }],
        "php-testing",
      ),
    ).toBe("awaiting-approval");
  });
});

describe("filterByPermission", () => {
  const selection: SelectorResult = {
    selected: ["php-security", "php-testing"],
    attach: [{ id: "php-security" }, { id: "php-testing" }],
    dropped: [],
    reasonCodes: ["concern:security", "concern:testing"],
  };

  it("removes denied router skills and returns them for persistence", () => {
    const filtered = filterByPermission(selection, rules, new Set());
    expect(filtered.attach).toEqual([]);
    expect(filtered.deniedRouter).toEqual([
      { id: "php-security", status: "denied" },
      { id: "php-testing", status: "denied" },
    ]);
    expect(filtered.dropped).toContainEqual({
      id: "php-security",
      reason: "permission:denied",
    });
    expect(filtered.selected).toEqual(["php-security", "php-testing"]);
  });

  it("attaches awaiting-approval skills once", () => {
    const filtered = filterByPermission(
      selection,
      [{ action: "skill", resource: "php-*", effect: "ask" }],
      new Set(),
    );
    expect(filtered.attach).toEqual([
      { id: "php-security", status: "awaiting-approval" },
      { id: "php-testing", status: "awaiting-approval" },
    ]);
    expect(filtered.reasonCodes).toContain("permission:awaiting-approval");
  });

  it("never removes explicit skills but reports their status", () => {
    const filtered = filterByPermission(selection, rules, new Set(["php-security"]));
    expect(filtered.selected).toContain("php-security");
    expect(filtered.explicitStatuses).toEqual([{ id: "php-security", status: "denied" }]);
    expect(filtered.attach).toEqual([]);
  });
});

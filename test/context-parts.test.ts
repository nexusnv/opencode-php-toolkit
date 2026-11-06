import { describe, expect, it } from "vitest";
import { removePhpToolkitParts, renderToolkitStatePart } from "../src/context/parts.js";

describe("context parts", () => {
  it("removes prior php-toolkit system parts only", () => {
    const input = [
      { type: "text", text: "keep me" },
      { type: "text", text: "old", metadata: { "php-toolkit": { kind: "state" } } },
    ];
    expect(removePhpToolkitParts(input as never)).toEqual([{ type: "text", text: "keep me" }]);
  });

  it("renders a compact state block without prompt text", () => {
    const text = renderToolkitStatePart({
      profile: {
        type: "application",
        phpRequirement: "^8.2",
        frameworkHints: ["none"],
      } as never,
      state: {
        taskGeneration: 2,
        activeIntents: ["Build"],
        activeConcerns: ["Security"],
        selectedSkills: ["php-security"],
        attachedSkills: ["php-security"],
        activatedSkills: new Set(),
        unactivatedSkills: [
          {
            id: "php-security",
            status: "pending",
            attempts: 1,
            reason: "pending",
          },
        ],
      } as never,
    });
    expect(text).toContain("Task: generation 2");
    expect(text).toContain("pending: php-security");
    expect(text).not.toContain("prompt");
  });

  it("notes framework-specific limits without changing the routing labels", () => {
    const text = renderToolkitStatePart({
      profile: {
        type: "application",
        phpRequirement: "^8.2",
        frameworkHints: ["laravel"],
      } as never,
      state: {
        taskGeneration: 1,
        activeIntents: ["Build"],
        activeConcerns: [],
        selectedSkills: ["php-testing"],
        attachedSkills: ["php-testing"],
        activatedSkills: new Set(),
        unactivatedSkills: [],
      } as never,
    });
    expect(text).toContain("Framework: laravel");
    expect(text).toContain("framework-specific rules live in the sibling toolkit");
  });
});

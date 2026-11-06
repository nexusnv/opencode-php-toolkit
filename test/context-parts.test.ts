import { describe, expect, it } from "vitest";
import { removePhpToolkitParts, renderToolkitStatePart } from "../src/context/parts.js";
import {
  clearAllRoutingRenderContexts,
  getRoutingRenderContext,
  setRoutingRenderContext,
} from "../src/routing/state.js";

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

  it("evicts the stalest render context when the cache is full", () => {
    const id = (n: number) => `render-lru-${n}`;
    for (let n = 0; n < 101; n += 1) {
      setRoutingRenderContext(id(n), {
        profile: { type: "application", frameworkHints: ["none"] } as never,
        state: { taskGeneration: n + 1, lastPromptAt: n } as never,
      });
    }
    expect(getRoutingRenderContext(id(0))).toBeUndefined();
    expect(getRoutingRenderContext(id(100))?.state.taskGeneration).toBe(101);
    clearAllRoutingRenderContexts();
  });
});

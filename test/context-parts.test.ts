import { describe, expect, it } from "vitest";
import { removePhpToolkitParts, renderToolkitStatePart } from "../src/context/parts.js";
import { RoutingRenderContexts } from "../src/routing/state.js";

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

  it("renders risk-based architecture guidance", () => {
    const text = renderToolkitStatePart({
      profile: { type: "application", frameworkHints: ["none"] } as never,
      state: {
        taskGeneration: 1,
        mode: "risk",
        activeIntents: ["Design"],
        activeConcerns: ["Architecture"],
        selectedSkills: [],
        attachedSkills: [],
        activatedSkills: new Set(),
        unactivatedSkills: [],
      } as never,
    });
    expect(text).toContain("Architecture: risk mode");
    expect(text).toContain("one-line rationale");
    expect(text).toContain("2–3 options and approval");
  });

  it("renders strict architecture guidance", () => {
    const text = renderToolkitStatePart({
      profile: { type: "application", frameworkHints: ["none"] } as never,
      state: {
        taskGeneration: 1,
        mode: "strict",
        activeIntents: ["Design"],
        activeConcerns: ["Architecture"],
        selectedSkills: [],
        attachedSkills: [],
        activatedSkills: new Set(),
        unactivatedSkills: [],
      } as never,
    });
    expect(text).toContain("Architecture: strict mode");
    expect(text).toContain("design note");
    expect(text).toContain("approval before implementation");
  });

  it("omits architecture guidance when the mode is off", () => {
    const text = renderToolkitStatePart({
      profile: { type: "application", frameworkHints: ["none"] } as never,
      state: {
        taskGeneration: 1,
        mode: "off",
        activeIntents: ["Design"],
        activeConcerns: ["Architecture"],
        selectedSkills: [],
        attachedSkills: [],
        activatedSkills: new Set(),
        unactivatedSkills: [],
      } as never,
    });
    expect(text).not.toContain("Architecture:");
  });

  it("evicts the stalest render context when the cache is full", () => {
    const contexts = new RoutingRenderContexts();
    const id = (n: number) => `render-lru-${n}`;
    for (let n = 0; n < 101; n += 1) {
      contexts.set(id(n), {
        profile: { type: "application", frameworkHints: ["none"] } as never,
        state: { taskGeneration: n + 1, lastPromptAt: n } as never,
      });
    }
    expect(contexts.get(id(0))).toBeUndefined();
    expect(contexts.get(id(100))?.state.taskGeneration).toBe(101);
    contexts.clearAll();
  });
});

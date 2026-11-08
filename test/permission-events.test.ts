import { describe, expect, it } from "vitest";
import {
  applyPermissionsEvent,
  applySkillActivatedEvent,
} from "../src/routing/events.js";
import { createSessionState } from "../src/routing/state.js";

const baseState = (sessionID: string) =>
  createSessionState({ sessionID, projectRoot: "/repo", projectSubpath: null });

describe("routing events", () => {
  it("marks only the matching session and skill activated", () => {
    const state = baseState("s1");
    applySkillActivatedEvent(state, { sessionID: "s1", id: "php-testing" });
    applySkillActivatedEvent(state, { sessionID: "s2", id: "php-security" });
    expect(state.activatedSkills.has("php-testing")).toBe(true);
    expect(state.activatedSkills.has("php-security")).toBe(false);
  });

  it("moves denied to pending when permission changes to allow", () => {
    const state = baseState("s1");
    state.unactivatedSkills.push({
      id: "php-security",
      attempts: 1,
      status: "denied",
      reason: "permission:denied",
    });
    applyPermissionsEvent(state, [
      { action: "skill", resource: "php-security", effect: "allow" },
    ]);
    expect(state.unactivatedSkills[0].status).toBe("pending");
    expect(state.unactivatedSkills[0].attempts).toBe(0);
  });

  it("preserves the retry budget when an unrelated permission changes", () => {
    const state = baseState("s1");
    state.unactivatedSkills.push({
      id: "php-testing",
      attempts: 2,
      status: "pending",
      reason: "activation:not-confirmed",
    });
    applyPermissionsEvent(state, [
      { action: "skill", resource: "php-security", effect: "deny" },
    ]);
    expect(state.unactivatedSkills[0]).toMatchObject({
      status: "pending",
      attempts: 2,
      reason: "activation:not-confirmed",
    });
  });

  it("does not infer denial from missing activation", () => {
    const state = baseState("s1");
    state.unactivatedSkills.push({
      id: "php-security",
      attempts: 1,
      status: "pending",
      reason: "pending",
    });
    applyPermissionsEvent(state, []);
    expect(state.unactivatedSkills[0].status).toBe("pending");
  });

  it("moves awaiting approval to denied on a deny rule", () => {
    const state = baseState("s1");
    state.unactivatedSkills.push({
      id: "php-security",
      attempts: 1,
      status: "awaiting-approval",
      reason: "permission:awaiting-approval",
    });
    applyPermissionsEvent(state, [
      { action: "skill", resource: "php-*", effect: "deny" },
    ]);
    expect(state.unactivatedSkills[0]).toMatchObject({
      status: "denied",
      reason: "permission:denied",
    });
  });
});

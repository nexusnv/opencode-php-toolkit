import { describe, expect, it } from "vitest";
import {
  deserialize,
  METRICS_VERSION,
  type MetricsProject,
} from "../src/metrics/store.js";

const project: MetricsProject = { name: "demo", path: "/repo/demo" };

describe("metrics v3", () => {
  it("adds empty routing, verification and scanner sections to v2 documents", () => {
    const { metrics, supported } = deserialize(
      {
        version: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        projectName: "demo",
        projectPath: project.path,
        tools: {},
        commands: {},
        triggerHits: 3,
      },
      project,
    );

    expect(supported).toBe(true);
    expect(metrics.version).toBe(METRICS_VERSION);
    expect(metrics.triggerHits).toBe(3);
    expect(metrics.routing).toEqual({
      selections: {},
      activations: {},
      unactivated: {},
      intents: {},
      concerns: {},
      dropped: {},
      taskGenerations: 0,
      continuations: 0,
      resets: 0,
    });
    expect(metrics.verification).toEqual({
      runs: 0,
      passed: 0,
      failed: 0,
      warning: 0,
      skipped: 0,
      partial: 0,
      unavailable: 0,
      error: 0,
      timedOut: 0,
      cancelled: 0,
      findings: 0,
      lastRunAt: null,
    });
    expect(metrics.scanner).toEqual({
      runs: 0,
      findings: 0,
      hypotheses: 0,
      truncated: 0,
      cacheHits: 0,
      cacheModes: { content: 0, metadata: 0 },
      lastRunAt: null,
    });
  });

  it("refuses to overwrite a newer metrics document", () => {
    const { supported, metrics } = deserialize({ version: METRICS_VERSION + 1 }, project);
    expect(supported).toBe(false);
    expect(metrics.version).toBe(METRICS_VERSION);
  });

  it("preserves populated routing, verification and scanner sections", () => {
    const { metrics } = deserialize(
      {
        version: 3,
        routing: {
          selections: { "php-testing": { count: 4, lastUsedAt: "2026-01-01T00:00:00.000Z" } },
          activations: { "php-testing": { count: 3, lastUsedAt: "2026-01-02T00:00:00.000Z" } },
          unactivated: { "php-security": 2 },
          intents: { Build: 5 },
          concerns: { Testing: 4 },
          dropped: { "budget:max-skills": 1 },
          taskGenerations: 3,
          continuations: 2,
          resets: 1,
        },
        verification: {
          runs: 6,
          passed: 4,
          failed: 1,
          warning: 2,
          skipped: 3,
          partial: 1,
          unavailable: 1,
          error: 1,
          timedOut: 1,
          cancelled: 1,
          findings: 7,
          lastRunAt: "2026-01-03T00:00:00.000Z",
        },
        scanner: {
          runs: 2,
          findings: 5,
          hypotheses: 3,
          truncated: 1,
          cacheHits: 4,
          cacheModes: { content: 2, metadata: 1 },
          lastRunAt: "2026-01-04T00:00:00.000Z",
        },
      },
      project,
    );

    expect(metrics.routing.selections["php-testing"]).toMatchObject({ count: 4 });
    expect(metrics.routing.activations["php-testing"]).toMatchObject({ count: 3 });
    expect(metrics.routing.unactivated["php-security"]).toBe(2);
    expect(metrics.routing.taskGenerations).toBe(3);
    expect(metrics.verification).toMatchObject({ runs: 6, failed: 1, findings: 7 });
    expect(metrics.scanner).toMatchObject({
      runs: 2,
      findings: 5,
      cacheModes: { content: 2, metadata: 1 },
    });
  });
});

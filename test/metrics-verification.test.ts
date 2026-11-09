import { describe, expect, it } from "vitest";
import {
  MetricsStore,
  deserialize,
  emptyVerificationMetrics,
  mergeDelta,
  type MetricsDelta,
  type MetricsProject,
  type MetricsStorage,
} from "../src/metrics/store.js";
import type { AggregateStatus, CheckResult } from "../src/verify/types.js";

const project: MetricsProject = { name: "demo", path: "/repo/demo" };

function memoryStorage(): MetricsStorage & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: async (key) => entries.get(key),
    set: async (key, value) => {
      entries.set(key, value);
    },
    remove: async (key) => {
      entries.delete(key);
    },
    scan: async ({ prefix, after, limit }) => ({
      entries: [...entries.entries()]
        .filter(([key]) => key.startsWith(prefix) && (!after || key > after))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, limit ?? 100)
        .map(([key, value]) => ({ key, value })),
    }),
  };
}

function check(status: CheckResult["status"], findings = 0): CheckResult {
  return { check: "lint", status, reason: null, summary: "", findings, detail: null };
}

describe("recordVerification", () => {
  it("records the aggregate status and per-check non-terminal statuses", async () => {
    const store = new MetricsStore(memoryStorage(), project);
    await store.recordVerification({
      status: "partial",
      checks: [check("passed"), check("skipped"), check("warning"), check("timed_out"), check("cancelled")],
      findings: 4,
    });
    const verification = store.getSnapshot().verification;
    expect(verification).toMatchObject({
      runs: 1,
      partial: 1,
      skipped: 1,
      warning: 1,
      timedOut: 1,
      cancelled: 1,
      findings: 4,
      lastStatus: "partial",
    });
    expect(verification.lastRunAt).not.toBeNull();
  });

  it("keeps aggregate counters mutually exclusive", async () => {
    const store = new MetricsStore(memoryStorage(), project);
    const statuses: AggregateStatus[] = ["passed", "failed", "unavailable", "error"];
    for (const status of statuses) {
      await store.recordVerification({ status, checks: [check(status === "passed" ? "passed" : "failed")], findings: 1 });
    }
    expect(store.getSnapshot().verification).toMatchObject({
      runs: 4,
      passed: 1,
      failed: 1,
      unavailable: 1,
      error: 1,
      partial: 0,
      findings: 4,
      lastStatus: "error",
    });
  });

  it("persists and reloads verification counts", async () => {
    const storage = memoryStorage();
    const first = new MetricsStore(storage, project);
    await first.recordVerification({ status: "failed", checks: [check("failed", 2)], findings: 2 });
    await first.flush();

    const second = new MetricsStore(storage, project);
    await second.init();
    expect(second.getSnapshot().verification).toMatchObject({
      runs: 1,
      failed: 1,
      findings: 2,
      lastStatus: "failed",
    });
  });
});

describe("verification merge and migration", () => {
  it("sums counters and keeps the later last run", () => {
    const base: MetricsDelta = {
      tools: {},
      commands: {},
      triggerHits: 0,
      routing: {
        selections: {},
        activations: {},
        unactivated: {},
        intents: {},
        concerns: {},
        dropped: {},
        taskGenerations: 0,
        continuations: 0,
        resets: 0,
      },
      verification: {
        ...emptyVerificationMetrics(),
        runs: 1,
        passed: 1,
        findings: 2,
        lastRunAt: "2026-01-01T00:00:00.000Z",
        lastStatus: "passed",
      },
    };
    const delta: MetricsDelta = {
      ...base,
      verification: {
        ...emptyVerificationMetrics(),
        runs: 1,
        failed: 1,
        findings: 3,
        lastRunAt: "2026-01-02T00:00:00.000Z",
        lastStatus: "failed",
      },
    };
    expect(mergeDelta(base, delta).verification).toMatchObject({
      runs: 2,
      passed: 1,
      failed: 1,
      findings: 5,
      lastRunAt: "2026-01-02T00:00:00.000Z",
      lastStatus: "failed",
    });
  });

  it("migrates lastStatus and rejects an unknown value", () => {
    const known = deserialize({ version: 3, verification: { runs: 1, lastStatus: "failed" } }, project);
    expect(known.metrics.verification.lastStatus).toBe("failed");
    const unknown = deserialize({ version: 3, verification: { runs: 1, lastStatus: "weird" } }, project);
    expect(unknown.metrics.verification.lastStatus).toBeNull();
  });
});

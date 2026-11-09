import { describe, expect, it } from "vitest";
import { aggregateStatus, countStatuses } from "../src/verify/aggregate.js";
import type { CheckResult, CheckStatus } from "../src/verify/types.js";

function result(status: CheckStatus, check: CheckResult["check"] = "lint"): CheckResult {
  return { check, status, reason: status === "passed" ? null : "test-reason", summary: "", findings: 0, detail: null };
}

describe("aggregateStatus", () => {
  it("passes only when every check passed", () => {
    expect(aggregateStatus([result("passed"), result("passed", "composer")])).toBe("passed");
  });

  it("fails when any check failed", () => {
    expect(aggregateStatus([result("passed"), result("failed", "static"), result("skipped")])).toBe("failed");
  });

  it("is unavailable when every check is unavailable", () => {
    expect(aggregateStatus([result("unavailable"), result("unavailable", "static")])).toBe("unavailable");
  });

  it("is partial for warnings, skips, timeouts, cancellations and mixes", () => {
    for (const status of ["warning", "skipped", "timed_out", "cancelled"] as const) {
      expect(aggregateStatus([result("passed"), result(status)])).toBe("partial");
      expect(aggregateStatus([result(status)])).toBe("partial");
    }
    expect(aggregateStatus([result("passed"), result("unavailable", "style")])).toBe("partial");
  });

  it("treats an empty report as unavailable, never passed", () => {
    expect(aggregateStatus([])).toBe("unavailable");
  });
});

describe("countStatuses", () => {
  it("counts each per-check status", () => {
    expect(
      countStatuses([
        result("passed"),
        result("passed", "composer"),
        result("failed", "static"),
        result("warning", "tests"),
        result("skipped", "style"),
        result("timed_out", "architecture"),
        result("cancelled", "lint"),
        result("unavailable", "composer"),
      ]),
    ).toEqual({
      passed: 2,
      failed: 1,
      warning: 1,
      skipped: 1,
      unavailable: 1,
      timed_out: 1,
      cancelled: 1,
    });
  });
});

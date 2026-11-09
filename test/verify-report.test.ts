import { describe, expect, it } from "vitest";
import { MAX_VERIFICATION_CHARS, renderVerificationReport } from "../src/verify/report.js";
import type { CheckResult } from "../src/verify/types.js";

const passed = (check: CheckResult["check"], summary = "ok"): CheckResult => ({
  check,
  status: "passed",
  reason: null,
  summary,
  findings: 0,
  detail: null,
});

describe("renderVerificationReport", () => {
  it("renders checks in the fixed order and includes the summary", () => {
    const text = renderVerificationReport({
      scope: "changed",
      checks: [passed("static", "2 errors"), passed("lint", "3 files, 0 errors")],
      permissionNote: null,
      changedNote: null,
    }).text;
    expect(text.indexOf("lint")).toBeLessThan(text.indexOf("static"));
    expect(text).toContain("PHP verification (scope: changed)");
    expect(text).toContain("Summary: passed");
  });

  it("shows reason codes and a next step for partial reports", () => {
    const report = renderVerificationReport({
      scope: "changed",
      checks: [
        passed("composer", "valid"),
        {
          check: "style",
          status: "unavailable",
          reason: "not-installed",
          summary: "php-cs-fixer not installed",
          findings: 0,
          detail: null,
        },
      ],
      permissionNote: "permission:tool-level-only",
      changedNote: null,
    });
    expect(report.status).toBe("partial");
    expect(report.text).toContain("(not-installed)");
    expect(report.text).toContain("Permission: permission:tool-level-only");
    expect(report.text).toContain("Summary: partial");
    expect(report.text).toContain("Next:");
  });

  it("renders the failed aggregate and failure details", () => {
    const report = renderVerificationReport({
      scope: "all",
      checks: [
        {
          check: "static",
          status: "failed",
          reason: null,
          summary: "2 errors (PHPStan)",
          findings: 2,
          detail: "src/App.php:10 error one\nsrc/App.php:20 error two",
        },
      ],
      permissionNote: null,
      changedNote: null,
    });
    expect(report.status).toBe("failed");
    expect(report.findings).toBe(2);
    expect(report.text).toContain("Summary: failed");
    expect(report.text).toContain("src/App.php:10 error one");
    expect(report.text).toContain("fix the failing checks");
  });

  it("caps the report at 24,000 characters with a visible notice", () => {
    const report = renderVerificationReport({
      scope: "changed",
      checks: [
        {
          check: "tests",
          status: "failed",
          reason: null,
          summary: "many failures",
          findings: 1,
          detail: "x".repeat(40_000),
        },
      ],
      permissionNote: null,
      changedNote: null,
    });
    expect(report.text.length).toBeLessThanOrEqual(MAX_VERIFICATION_CHARS);
    expect(report.text).toContain("report truncated");
  });

  it("reports an unavailable aggregate without check rows", () => {
    const report = renderVerificationReport({
      scope: "changed",
      checks: [],
      permissionNote: null,
      changedNote: null,
    });
    expect(report.status).toBe("unavailable");
    expect(report.text).toContain("no checks were requested");
  });

  it("reports a tool-level error without pretending checks ran", () => {
    const report = renderVerificationReport({
      scope: "changed",
      checks: [],
      permissionNote: null,
      changedNote: null,
      error: "path escapes the verification root: ../x.php",
    });
    expect(report.status).toBe("error");
    expect(report.findings).toBe(0);
    expect(report.text).toContain("Verification error: path escapes the verification root: ../x.php");
  });
});

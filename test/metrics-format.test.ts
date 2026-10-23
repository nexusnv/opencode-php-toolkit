import { describe, expect, it } from "vitest";
import { formatMetricsSnapshot, type ProjectScan } from "../src/metrics/format.js";
import type { PhpToolkitMetrics } from "../src/metrics/store.js";

function metrics(overrides: Partial<PhpToolkitMetrics> = {}): PhpToolkitMetrics {
  return {
    version: 2,
    startedAt: "2026-10-21T09:00:00.000Z",
    projectName: "my-app",
    projectPath: "/home/dev/my-app",
    tools: {},
    commands: {},
    triggerHits: 0,
    ...overrides,
  };
}

function scan(overrides: Partial<ProjectScan> = {}): ProjectScan {
  return { projects: [], truncated: false, failed: false, ...overrides };
}

describe("formatMetricsSnapshot", () => {
  it("names the project so the snapshot is about the right codebase", () => {
    const out = formatMetricsSnapshot(metrics());
    expect(out).toContain("my-app");
    expect(out).toContain("stored locally");
  });

  it("never discloses the absolute project path", () => {
    const out = formatMetricsSnapshot(metrics());
    expect(out).not.toContain("/home/dev/my-app");
  });

  it("says so plainly when nothing has been tracked yet", () => {
    const out = formatMetricsSnapshot(metrics());
    expect(out).toContain("(no tool has run yet)");
    expect(out).toContain("(no command has run yet)");
    expect(out).toContain("0 issues surfaced");
  });

  it("reports runs, outcomes and findings per tool", () => {
    const out = formatMetricsSnapshot(
      metrics({
        triggerHits: 12,
        tools: {
          php_lint: {
            runs: 3,
            ok: 3,
            error: 0,
            findings: 2,
            lastUsedAt: "2026-10-21T09:12:00.000Z",
            lastStatus: "ok",
          },
          php_composer_audit: {
            runs: 1,
            ok: 1,
            error: 0,
            findings: 3,
            lastUsedAt: "2026-10-21T09:14:00.000Z",
            lastStatus: "ok",
          },
        },
        commands: { "php-review": { count: 2, lastUsedAt: "2026-10-21T09:15:00.000Z" } },
      }),
    );

    expect(out).toContain("PHP-mentioning prompts: 12");
    expect(out).toContain("php_lint");
    expect(out).toContain("3 runs");
    expect(out).toContain("3 ok / 0 error");
    expect(out).toContain("2 findings");
    expect(out).toContain("php-review");
    expect(out).toContain("2 invocations");
    expect(out).toContain("5 issues surfaced by the toolkit in this project.");
  });

  it("distinguishes a tool that could not run from one that found problems", () => {
    const out = formatMetricsSnapshot(
      metrics({
        tools: {
          php_lint: {
            runs: 2,
            ok: 1,
            error: 1,
            findings: 4,
            lastUsedAt: "2026-10-21T09:12:00.000Z",
            lastStatus: "error",
          },
        },
      }),
    );
    expect(out).toContain("1 ok / 1 error");
    expect(out).toContain("4 findings");
  });

  it("adds the machine-wide breakdown when other projects are requested", () => {
    const out = formatMetricsSnapshot(
      metrics({
        triggerHits: 1,
        tools: {
          php_lint: { runs: 2, ok: 2, error: 0, findings: 1, lastUsedAt: "", lastStatus: "ok" },
        },
      }),
      scan({
        projects: [
          metrics({
            projectName: "other-app",
            projectPath: "/home/dev/other-app",
            triggerHits: 4,
            tools: {
              php_lint: { runs: 5, ok: 5, error: 0, findings: 7, lastUsedAt: "", lastStatus: "ok" },
            },
          }),
        ],
      }),
    );
    expect(out).toContain("All projects on this machine");
    expect(out).toContain("other-app");
    expect(out).toContain("TOTAL");
    expect(out).toContain("7 runs");
    expect(out).toContain("1 prompt");
    expect(out).toContain("4 prompts");
  });

  it("marks an unavailable cross-project view instead of showing an empty one", () => {
    const out = formatMetricsSnapshot(metrics(), scan({ failed: true }));
    expect(out).toContain("unavailable");
    expect(out).not.toContain("no other project has been tracked yet");
  });

  it("marks a truncated cross-project view as partial", () => {
    const out = formatMetricsSnapshot(
      metrics(),
      scan({
        projects: [metrics({ projectName: "other-app", tools: {}, commands: {} })],
        truncated: true,
      }),
    );
    expect(out).toContain("partial");
  });

  it("handles a project that has never been touched", () => {
    const out = formatMetricsSnapshot(
      metrics(),
      scan({ projects: [metrics({ projectName: "", projectPath: "", tools: {}, commands: {} })] }),
    );
    expect(out).toContain("unknown");
  });
});

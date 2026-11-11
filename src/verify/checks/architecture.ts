import { join } from "node:path";
import type { ProjectProfile } from "../../profile.js";
import { REASONS, type CheckResult } from "../types.js";
import {
  failed,
  passed,
  pathExists,
  runFailure,
  skipped,
  unavailable,
  type CheckEnvironment,
} from "./shared.js";

export function architectureDetected(profile: ProjectProfile): boolean {
  return Boolean(
    profile.tools.deptrac ||
      profile.configFiles?.deptrac ||
      profile.configFiles?.architecture,
  );
}

function countViolations(text: string): number {
  const matches = text.match(/(\d+)\s+violation/gi) ?? [];
  const counts = matches
    .map((match) => Number(match.match(/\d+/)?.[0] ?? "0"))
    .filter((count) => count > 0);
  return counts.length ? Math.max(...counts) : 1;
}

export async function architectureCheck(env: CheckEnvironment): Promise<CheckResult> {
  const deptracConfigured =
    env.profile.tools.deptrac || Boolean(env.profile.configFiles?.deptrac);
  if (!deptracConfigured) {
    return skipped(
      "architecture",
      REASONS.scannerUnavailable,
      env.profile.configFiles?.architecture
        ? "configured boundaries; Phase 5 scanner adapter pending"
        : "no Deptrac config; Phase 5 scanner adapter pending",
    );
  }
  const binary = join(env.root, "vendor/bin/deptrac");
  if (!(await pathExists(binary))) {
    return unavailable("architecture", REASONS.notInstalled, "Deptrac not installed");
  }
  const result = await env.runner.run(
    binary,
    ["analyse", "--no-progress"],
    env.root,
    120_000,
    env.signal,
  );
  const failure = runFailure("architecture", result, "Deptrac not installed");
  if (failure) return failure;
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (result.ok) return passed("architecture", "no violations (Deptrac)");
  if (result.code === 1) {
    const count = countViolations(text);
    return failed("architecture", `${count} violation(s) (Deptrac)`, count, text);
  }
  return unavailable("architecture", REASONS.executionFailed, "Deptrac could not run", text);
}

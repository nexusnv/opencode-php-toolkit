import { join } from "node:path";
import type { ProjectProfile } from "../../profile.js";
import { scanArchitecture } from "../../architecture/scanner.js";
import { REASONS, type CheckResult } from "../types.js";
import {
  failed,
  passed,
  cancelled,
  pathExists,
  runFailure,
  skipped,
  timedOut,
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
  const toolkitConfig = env.profile.toolkitConfig;
  const architecture = toolkitConfig?.config.architecture ?? null;
  const hasBoundaries = Boolean(architecture && Object.keys(architecture.layers).length > 0);
  if (!hasBoundaries && !deptracConfigured && env.profile.configFiles?.architecture && toolkitConfig?.diagnostics.some((item) => item.startsWith("architecture"))) {
    const diagnostics = toolkitConfig.diagnostics.filter((item) => item.startsWith("architecture"));
    return skipped("architecture", REASONS.scannerUnavailable, `invalid architecture config; ${diagnostics.join("; ")}`);
  }
  if (!deptracConfigured && !hasBoundaries) {
    return skipped(
      "architecture",
      REASONS.scannerUnavailable,
      env.profile.configFiles?.architecture ? "no valid explicit architecture layers configured" : "no Deptrac config or explicit architecture layers",
    );
  }

  const results: CheckResult[] = [];
  if (hasBoundaries) {
    const scan = await scanArchitecture(env.root, env.profile, { runner: env.runner, signal: env.signal });
    if (scan.status === "cancelled") return cancelled("architecture", REASONS.aborted, "architecture scan cancelled");
    if (scan.status === "timed-out") return timedOut("architecture", "architecture scanner timed out");
    if (scan.status === "unavailable") return unavailable("architecture", REASONS.scannerUnavailable, scan.error ?? "PHP architecture scanner unavailable");
    if (scan.status === "error") return unavailable("architecture", REASONS.executionFailed, "PHP architecture scanner failed", scan.error ?? null);
    const findings = scan.results.filter((item) => item.kind === "finding");
    const hypotheses = scan.results.filter((item) => item.kind === "hypothesis");
    const detail = [
      ...findings.map((item) => `${item.file ?? "project"}${item.line ? `:${item.line}` : ""}: ${item.message}${item.evidence ? ` (${item.evidence})` : ""}`),
      ...hypotheses.map((item) => `hypothesis: ${item.file ?? "project"}: ${item.message} [${item.candidatePatterns?.join(", ") ?? "review"}]`),
      ...scan.diagnostics.map((item) => `diagnostic: ${item}`),
    ].join("\n");
    if (findings.length) {
      results.push(failed("architecture", `${findings.length} configured boundary violation(s) (PHP scanner)`, findings.length, detail));
    } else if (!scan.truncated && scan.diagnostics.length === 0) {
      results.push(passed("architecture", `no configured boundary violations (PHP scanner; ${hypotheses.length} hypothesis/hypotheses)`));
    }
    if (scan.truncated || scan.diagnostics.length > 0) {
      const reasons = [
        scan.truncated ? "file limit reached" : "",
        scan.diagnostics.length ? `${scan.diagnostics.length} scanner diagnostic(s)` : "",
      ].filter(Boolean).join(", ");
      results.push(unavailable(
        "architecture",
        REASONS.scannerUnavailable,
        `PHP architecture scan incomplete (${reasons})`,
        scan.diagnostics.length ? scan.diagnostics.join("\n") : null,
      ));
    }
  }

  if (deptracConfigured) {
    const binary = join(env.root, "vendor/bin/deptrac");
    if (!(await pathExists(binary))) {
      results.push(unavailable("architecture", REASONS.notInstalled, "Deptrac not installed"));
    } else {
      const result = await env.runner.run(binary, ["analyse", "--no-progress"], env.root, 120_000, env.signal);
      const failure = runFailure("architecture", result, "Deptrac not installed");
      if (failure) results.push(failure);
      else {
        const text = `${result.stdout}\n${result.stderr}`.trim();
        if (result.ok) results.push(passed("architecture", "no violations (Deptrac)"));
        else if (result.code === 1) {
          const count = countViolations(text);
          results.push(failed("architecture", `${count} violation(s) (Deptrac)`, count, text));
        } else results.push(unavailable("architecture", REASONS.executionFailed, "Deptrac could not run", text));
      }
    }
  }

  const failedResults = results.filter((item) => item.status === "failed");
  if (failedResults.length) {
    return failed("architecture", failedResults.map((item) => item.summary).join("; "), failedResults.reduce((sum, item) => sum + item.findings, 0), failedResults.map((item) => item.detail).filter(Boolean).join("\n"));
  }
  const operational = results.find((item) => ["unavailable", "cancelled", "timed_out"].includes(item.status));
  if (operational) return { ...operational, check: "architecture" };
  return passed("architecture", results.map((item) => item.summary).join("; "));
}

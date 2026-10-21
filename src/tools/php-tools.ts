import { execFile } from "node:child_process";

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Exit code when the command ran, "ENOENT" when the binary is missing. */
  code: number | string | null;
  /** True when the process was killed (timeout or abort). */
  killed: boolean;
}

/**
 * Result of a tool invocation.
 *
 * `status` describes the tool: "ok" means it completed the requested work,
 * "error" means it could not (missing binary, timeout, a file it could not
 * read). `findings` describes the user's code: parse errors, advisories, an
 * invalid manifest. Keeping them apart is what makes the metric meaningful -
 * a lint that finds a broken file is a successful lint with a finding.
 */
export interface ToolOutcome {
  text: string;
  status: "ok" | "error";
  findings: number;
}

/** `php -l` exits 255 when the file does not parse. */
const PHP_PARSE_ERROR_EXIT = 255;

/** `composer validate` exits 1 for a bad manifest, 3 when there is none. */
const COMPOSER_INVALID_EXIT = 1;
const COMPOSER_NO_MANIFEST_EXIT = 3;

function run(cmd: string, args: string[], cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout ?? ""),
        stderr: String((err as Error)?.message ?? stderr ?? ""),
        code: (err as { code?: number | string } | null)?.code ?? null,
        // `killed` is set when we killed the child (timeout/abort); a child
        // that died on its own reports a signal instead.
        killed: Boolean(
          (err as { killed?: boolean; signal?: NodeJS.Signals } | null)?.killed ||
            (err as { signal?: NodeJS.Signals } | null)?.signal,
        ),
      });
    });
    signal?.addEventListener("abort", () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    });
  });
}

function isMissingBinary(result: RunResult): boolean {
  return result.code === "ENOENT" || result.stderr.includes("command not found");
}

/** Parsed shape of a `composer audit --format=json` report. */
export type AuditReport = { advisories: number } | null;

/**
 * Parses an audit report.
 *
 * Returns `null` when the output is not a usable report, so a failed audit is
 * never mistaken for a clean one.
 */
export function parseAuditReport(stdout: string): AuditReport {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const advisories = (parsed as { advisories?: unknown }).advisories;
  if (!advisories || typeof advisories !== "object") return null;
  let total = 0;
  for (const list of Object.values(advisories as Record<string, unknown>)) {
    if (Array.isArray(list)) total += list.length;
  }
  return { advisories: total };
}

/** Counts advisories in `composer audit --format=json` output. */
export function countAdvisories(stdout: string): number {
  return parseAuditReport(stdout)?.advisories ?? 0;
}

export async function phpLint(paths: string[], cwd: string, signal?: AbortSignal): Promise<ToolOutcome> {
  const files = Array.isArray(paths) ? paths : [];
  if (!files.length) {
    return {
      text: "php_lint: no paths given. Pass one or more .php files.",
      status: "error",
      findings: 0,
    };
  }
  const out: string[] = [];
  let findings = 0;
  let linted = 0;
  let unreadable = 0;
  for (const p of files.slice(0, 20)) {
    const r = await run("php", ["-l", p], cwd, 15000, signal);
    if (isMissingBinary(r)) {
      unreadable += 1;
      out.push(`${p}: php not found on PATH. Install PHP 8.1+ then retry.`);
      continue;
    }
    if (r.killed) {
      unreadable += 1;
      out.push(`${p}: lint timed out or was aborted.`);
      continue;
    }
    if (!r.ok && r.code !== PHP_PARSE_ERROR_EXIT) {
      // The file could not be linted (missing, unreadable, ...) - that is an
      // operational failure, not a problem in the user's code.
      unreadable += 1;
      out.push(`${p}: COULD NOT LINT\n${r.stdout}${r.stderr}`.trim());
      continue;
    }
    linted += 1;
    // The file failed to parse: the lint worked, the code did not.
    if (!r.ok) findings += 1;
    out.push(`${p}: ${r.ok ? "OK" : "FAIL"}\n${r.stdout}${r.stderr}`.trim());
  }
  const text = out.join("\n\n").slice(0, 20000) || "php_lint: empty result.";
  if (!linted || unreadable > 0) {
    // The tool did not complete everything it was asked to do.
    return { text, status: "error", findings };
  }
  return { text, status: "ok", findings };
}

export async function composerValidate(cwd: string, signal?: AbortSignal): Promise<ToolOutcome> {
  const r = await run("composer", ["validate", "--no-check-publish"], cwd, 30000, signal);
  if (isMissingBinary(r)) {
    return {
      text: "composer not found on PATH. Install from https://getcomposer.org/download/ then retry.",
      status: "error",
      findings: 0,
    };
  }
  if (r.killed) {
    return { text: "composer validate timed out or was aborted.", status: "error", findings: 0 };
  }
  const text = `${r.ok ? "composer validate: OK" : "composer validate: FAIL"}\n${r.stdout}\n${r.stderr}`
    .trim()
    .slice(0, 12000);
  if (r.ok) return { text, status: "ok", findings: 0 };
  if (r.code === COMPOSER_NO_MANIFEST_EXIT) {
    // Nothing to validate - not a defect in the project.
    return { text, status: "ok", findings: 0 };
  }
  if (r.code === COMPOSER_INVALID_EXIT) {
    // The manifest is broken - a finding, not a tool error.
    return { text, status: "ok", findings: 1 };
  }
  return { text, status: "error", findings: 0 };
}

export async function composerAudit(cwd: string, signal?: AbortSignal): Promise<ToolOutcome> {
  const r = await run("composer", ["audit", "--format=json"], cwd, 60000, signal);
  if (isMissingBinary(r)) {
    return {
      text: `composer audit could not run:\n${r.stderr.slice(0, 2000) || "composer not found on PATH."}\nHint: needs composer.json + network. Run \`composer validate\` first.`,
      status: "error",
      findings: 0,
    };
  }
  if (r.killed) {
    return {
      text: `composer audit could not run:\n${r.stderr.slice(0, 4000)}\nHint: needs composer.json + network. Run \`composer validate\` first.`,
      status: "error",
      findings: 0,
    };
  }
  // The report is counted before the text is truncated: a report larger than
  // the display limit still has to produce the right number of findings.
  const report = parseAuditReport(r.stdout);
  if (!report) {
    const combined = `${r.stdout}\n${r.stderr}`.trim();
    return {
      text: `composer audit could not run:\n${combined.slice(0, 4000)}\nHint: needs composer.json + network. Run \`composer validate\` first.`,
      status: "error",
      findings: 0,
    };
  }
  const combined = `${r.stdout}\n${r.stderr}`.trim();
  return {
    text: `composer audit result:\n${combined.slice(0, 20000)}`,
    status: "ok",
    findings: report.advisories,
  };
}

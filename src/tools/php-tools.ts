import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  PERMISSION_APPROVAL_CODE,
  PERMISSION_DENIED_CODE,
  execFileRunner,
  isMissingBinary,
  type CommandRunner,
  type RunResult,
} from "./runner.js";

export type { RunResult } from "./runner.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function decodeXmlEntities(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    // Numeric entities too: PHPUnit escapes newlines inside attribute values
    // as &#10;, so a multi-line failure message would otherwise stay garbled.
    // Malformed code points are left as-is instead of throwing.
    .replace(/&#x([0-9a-fA-F]+);|&#(\d+);/g, (match, hex, dec) => {
      const code = hex !== undefined ? Number.parseInt(hex, 16) : Number(dec);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    // &amp; last: it re-creates the literal forms decoded above only when the
    // input was double-escaped (&amp;quot; etc.).
    .replaceAll("&amp;", "&");
}

export type ToolFailure =
  | "missing-tool"
  | "timed-out"
  | "aborted"
  | "permission-denied"
  | "permission-approval-required"
  | "execution";

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
  /** Stable failure category for orchestrators; absent on success. */
  failure?: ToolFailure;
}

/** `php -l` exits 255 when the file does not parse. */
const PHP_PARSE_ERROR_EXIT = 255;

/** `composer validate` exits 1 for a bad manifest, 3 when there is none. */
const COMPOSER_INVALID_EXIT = 1;
const COMPOSER_NO_MANIFEST_EXIT = 3;

const FAILURE_RANK: Record<ToolFailure, number> = {
  aborted: 5,
  "timed-out": 4,
  "permission-denied": 3,
  "permission-approval-required": 2,
  "missing-tool": 1,
  execution: 0,
};

function worseFailure(a: ToolFailure | undefined, b: ToolFailure | undefined): ToolFailure | undefined {
  if (!a) return b;
  if (!b) return a;
  return FAILURE_RANK[b] > FAILURE_RANK[a] ? b : a;
}

function failureFromRun(result: RunResult): ToolFailure | undefined {
  if (result.aborted) return "aborted";
  if (result.killed) return "timed-out";
  if (result.code === PERMISSION_DENIED_CODE) return "permission-denied";
  if (result.code === PERMISSION_APPROVAL_CODE) return "permission-approval-required";
  if (isMissingBinary(result)) return "missing-tool";
  return result.ok ? undefined : "execution";
}

function permissionFailure(result: RunResult): ToolFailure | undefined {
  if (result.code === PERMISSION_DENIED_CODE) return "permission-denied";
  if (result.code === PERMISSION_APPROVAL_CODE) return "permission-approval-required";
  return undefined;
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

export async function phpLint(
  paths: string[],
  cwd: string,
  signal?: AbortSignal,
  runner: CommandRunner = execFileRunner,
): Promise<ToolOutcome> {
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
  let failure: ToolFailure | undefined;
  for (const p of files.slice(0, 20)) {
    const r = await runner.run("php", ["-l", p], cwd, 15000, signal);
    if (r.code === PERMISSION_DENIED_CODE || r.code === PERMISSION_APPROVAL_CODE) {
      unreadable += 1;
      out.push(`${p}: ${r.stderr}`);
      failure = worseFailure(failure, permissionFailure(r));
      continue;
    }
    if (isMissingBinary(r)) {
      unreadable += 1;
      out.push(`${p}: php not found on PATH. Install PHP 8.1+ then retry.`);
      failure = worseFailure(failure, "missing-tool");
      continue;
    }
    if (r.killed) {
      unreadable += 1;
      out.push(`${p}: lint timed out or was aborted.`);
      failure = worseFailure(failure, r.aborted ? "aborted" : "timed-out");
      continue;
    }
    if (!r.ok && r.code !== PHP_PARSE_ERROR_EXIT) {
      // The file could not be linted (missing, unreadable, ...) - that is an
      // operational failure, not a problem in the user's code.
      unreadable += 1;
      out.push(`${p}: COULD NOT LINT\n${r.stdout}${r.stderr}`.trim());
      failure = worseFailure(failure, failureFromRun(r) ?? "execution");
      continue;
    }
    linted += 1;
    // The file failed to parse: the lint worked, the code did not.
    if (!r.ok) findings += 1;
    out.push(`${p}: ${r.ok ? "OK" : "FAIL"}\n${r.stdout}${r.stderr}`.trim());
  }
  if (files.length > 20) {
    // The cap is deliberate (output budget), but it must be visible.
    out.push(
      `php_lint: note: linted only the first 20 of ${files.length} paths; pass the remaining ${files.length - 20} in a separate call.`,
    );
  }
  const text = out.join("\n\n").slice(0, 20000) || "php_lint: empty result.";
  if (!linted || unreadable > 0) {
    // The tool did not complete everything it was asked to do.
    return { text, status: "error", findings, ...(failure ? { failure } : {}) };
  }
  return { text, status: "ok", findings, ...(failure ? { failure } : {}) };
}

export async function composerValidate(
  cwd: string,
  signal?: AbortSignal,
  runner: CommandRunner = execFileRunner,
): Promise<ToolOutcome> {
  const r = await runner.run("composer", ["validate", "--no-check-publish"], cwd, 30000, signal);
  const permission = permissionFailure(r);
  if (permission) {
    return {
      text: `composer validate could not run:\n${r.stderr}`,
      status: "error",
      findings: 0,
      failure: permission,
    };
  }
  if (isMissingBinary(r)) {
    return {
      text: "composer not found on PATH. Install from https://getcomposer.org/download/ then retry.",
      status: "error",
      findings: 0,
      failure: "missing-tool",
    };
  }
  if (r.killed) {
    return {
      text: "composer validate timed out or was aborted.",
      status: "error",
      findings: 0,
      failure: r.aborted ? "aborted" : "timed-out",
    };
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
  return { text, status: "error", findings: 0, failure: "execution" };
}

export async function composerAudit(cwd: string, signal?: AbortSignal): Promise<ToolOutcome> {
  const r = await execFileRunner.run("composer", ["audit", "--format=json"], cwd, 60000, signal);
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
  const combined = `${r.stdout}\n${r.stderr}`.trim();
  // The report is counted before the text is truncated: a report larger than
  // the display limit still has to produce the right number of findings.
  const report = parseAuditReport(r.stdout);
  if (!report) {
    // `composer audit` without a lock file exits 0 and prints this prose
    // instead of JSON - there is simply nothing to report.
    if (r.ok && /no packages/i.test(combined)) {
      return {
        text: `composer audit: nothing to audit.\n${combined}\nHint: run \`composer install\` first if you expected a dependency report.`,
        status: "ok",
        findings: 0,
      };
    }
    return {
      text: `composer audit could not run:\n${combined.slice(0, 4000)}\nHint: needs composer.json + network. Run \`composer validate\` first.`,
      status: "error",
      findings: 0,
    };
  }
  return {
    text: `composer audit result:\n${combined.slice(0, 20000)}`,
    status: "ok",
    findings: report.advisories,
  };
}

// ---- Static analysis (vendor binaries, JSON output) ----

function jsonSlice(raw: string, open: "{" | "[", close: "}" | "]"): string | null {
  const start = raw.indexOf(open);
  const end = raw.lastIndexOf(close);
  return start === -1 || end <= start ? null : raw.slice(start, end + 1);
}

export type StaticAnalysisSelection = "auto" | "phpstan" | "psalm";

export interface AnalysisReport {
  findings: number;
  /** Up to 20 rendered "file:line problem" lines, for display. */
  lines: string[];
}

/** Parses the `--error-format=json` output of phpstan (totals + files). */
export function parsePhpStanReport(stdout: string): AnalysisReport | null {
  const slice = jsonSlice(stdout, "{", "}");
  if (!slice) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const doc = parsed as { totals?: { errors?: unknown; file_errors?: unknown }; files?: unknown };
  // A JSON object without report fields is not a phpstan report (e.g. a
  // broken analyzer emitting arbitrary JSON): refuse it, so a failing exit
  // is reported as an analyzer error instead of a clean run.
  if (doc.totals === undefined && doc.files === undefined) return null;
  const lines: string[] = [];
  let counted = 0;
  if (doc.files && typeof doc.files === "object") {
    for (const [file, value] of Object.entries(doc.files as Record<string, unknown>)) {
      const messages = (value as { messages?: unknown } | null)?.messages;
      if (!Array.isArray(messages)) continue;
      for (const raw of messages) {
        counted += 1;
        const m = raw as { line?: unknown; message?: unknown } | null;
        const line = typeof m?.line === "number" ? `:${m.line}` : "";
        const msg = typeof m?.message === "string" ? m.message : "";
        if (msg && lines.length < 20) lines.push(`${file}${line} ${msg}`);
      }
    }
  }
  // totals.errors counts errors not tied to a file; file-specific errors are
  // counted in totals.file_errors (PHPStan's JsonErrorFormatter), not in
  // totals.errors. Fall back to the parsed message count when a total is
  // absent or invalid - only the displayed list is capped, never the count.
  const notFileErrors =
    typeof doc.totals?.errors === "number" && Number.isFinite(doc.totals.errors) ? doc.totals.errors : 0;
  const fileErrors =
    typeof doc.totals?.file_errors === "number" && Number.isFinite(doc.totals.file_errors)
      ? doc.totals.file_errors
      : counted;
  return { findings: notFileErrors + fileErrors, lines };
}

/** Parses the `--output-format=json` output of psalm (array of issues). */
export function parsePsalmReport(stdout: string): AnalysisReport | null {
  const slice = jsonSlice(stdout, "[", "]");
  if (!slice) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }
  const issues =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { issues?: unknown }).issues)
        ? (parsed as { issues: unknown[] }).issues
        : null;
  if (!issues) return null;
  const lines: string[] = [];
  for (const raw of issues.slice(0, 20)) {
    const o = raw as {
      file_name?: unknown;
      fileName?: unknown;
      line_from?: unknown;
      line?: unknown;
      message?: unknown;
    } | null;
    const file =
      typeof o?.file_name === "string" ? o.file_name : typeof o?.fileName === "string" ? o.fileName : "unknown";
    const rawLine = typeof o?.line_from === "number" ? o.line_from : typeof o?.line === "number" ? o.line : null;
    const line = rawLine !== null ? `:${rawLine}` : "";
    const msg = typeof o?.message === "string" ? o.message : "";
    lines.push(`${file}${line} ${msg}`.trim());
  }
  return { findings: issues.length, lines };
}

export async function phpStaticAnalysis(
  rawCwd: string,
  signal?: AbortSignal,
  selection: StaticAnalysisSelection = "auto",
  options: { runner?: CommandRunner; paths?: string[] } = {},
): Promise<ToolOutcome> {
  // Resolve once: the vendor binaries are joined onto this path AND it is
  // the child cwd, so a relative input must not be applied twice.
  const cwd = resolve(rawCwd);
  const phpstanBin = join(cwd, "vendor/bin/phpstan");
  const psalmBin = join(cwd, "vendor/bin/psalm");
  const [hasPhpstan, hasPsalm] = await Promise.all([pathExists(phpstanBin), pathExists(psalmBin)]);
  let kind: "phpstan" | "psalm" | null = hasPhpstan ? "phpstan" : hasPsalm ? "psalm" : null;
  if (selection === "phpstan") kind = hasPhpstan ? "phpstan" : null;
  if (selection === "psalm") kind = hasPsalm ? "psalm" : null;

  if (!kind) {
    const want =
      selection === "auto" ? "phpstan/phpstan or vimeo/psalm" : selection === "phpstan" ? "phpstan/phpstan" : "vimeo/psalm";
    return {
      text: `php_static_analysis: no analyzer found. Install ${want} as a dev dependency, run \`composer install\`, then retry.`,
      status: "error",
      findings: 0,
      failure: "missing-tool",
    };
  }

  const runner = options.runner ?? execFileRunner;
  const paths = options.paths && options.paths.length > 0 ? options.paths : [];

  if (kind === "phpstan") {
    const r = await runner.run(
      phpstanBin,
      ["analyse", "--no-progress", "--error-format=json", ...paths],
      cwd,
      300000,
      signal,
    );
    const permission = permissionFailure(r);
    if (permission) {
      return { text: `phpstan could not run:\n${r.stderr}`, status: "error", findings: 0, failure: permission };
    }
    if (isMissingBinary(r)) {
      return {
        text: `phpstan could not run:\n${r.stderr.slice(0, 4000)}`,
        status: "error",
        findings: 0,
        failure: "missing-tool",
      };
    }
    if (r.killed) {
      return {
        text: "phpstan timed out or was aborted.",
        status: "error",
        findings: 0,
        failure: r.aborted ? "aborted" : "timed-out",
      };
    }
    const report = parsePhpStanReport(r.stdout);
    if (!report) {
      // phpstan exits 0 when clean (it emits no JSON then), 1 when it finds
      // errors. Prose output on a failing exit means the analyzer broke.
      if (r.ok) return { text: `phpstan: no errors reported.\n${r.stdout.slice(0, 2000)}`, status: "ok", findings: 0 };
      return {
        text: `phpstan could not run:\n${`${r.stdout}\n${r.stderr}`.trim().slice(0, 4000)}`,
        status: "error",
        findings: 0,
        failure: "execution",
      };
    }
    const listed = report.lines.join("\n");
    const more =
      report.findings > report.lines.length ? `\n... and ${report.findings - report.lines.length} more` : "";
    return {
      text: `phpstan: ${report.findings} error(s)\n${listed}${more}`.slice(0, 16000),
      status: "ok",
      findings: report.findings,
    };
  }

  const r = await runner.run(
    psalmBin,
    ["--no-cache", "--no-progress", "--output-format=json", ...paths],
    cwd,
    300000,
    signal,
  );
  const permission = permissionFailure(r);
  if (permission) {
    return { text: `psalm could not run:\n${r.stderr}`, status: "error", findings: 0, failure: permission };
  }
  if (isMissingBinary(r)) {
    return {
      text: `psalm could not run:\n${r.stderr.slice(0, 4000)}`,
      status: "error",
      findings: 0,
      failure: "missing-tool",
    };
  }
  if (r.killed) {
    return {
      text: "psalm timed out or was aborted.",
      status: "error",
      findings: 0,
      failure: r.aborted ? "aborted" : "timed-out",
    };
  }
  const report = parsePsalmReport(r.stdout);
  if (!report) {
    if (r.ok) return { text: `psalm: no issues reported.\n${r.stdout.slice(0, 2000)}`, status: "ok", findings: 0 };
    return {
      text: `psalm could not run:\n${`${r.stdout}\n${r.stderr}`.trim().slice(0, 4000)}`,
      status: "error",
      findings: 0,
      failure: "execution",
    };
  }
  const listed = report.lines.join("\n");
  const more =
    report.findings > report.lines.length ? `\n... and ${report.findings - report.lines.length} more` : "";
  return {
    text: `psalm: ${report.findings} issue(s)\n${listed}${more}`.slice(0, 16000),
    status: "ok",
    findings: report.findings,
  };
}

// ---- Test runner (vendor binaries, JUnit on stdout) ----

export type TestRunnerKind = "pest" | "phpunit";

export interface TestSummary {
  tests: number;
  assertions: number;
  failures: number;
  errors: number;
  skipped: number;
  /** Up to 20 rendered "file:line problem" lines, for display. */
  failing: string[];
}

/**
 * Parses `<testsuites>` from `--log-junit php://stdout`. The outermost
 * testsuite carries the aggregate counts; attribute order differs between
 * PHPUnit/Pest versions, so attributes are read individually.
 */
export function parseJUnitReport(stdout: string): TestSummary | null {
  const suite = stdout.match(/<testsuite\b[^>]*>/);
  if (!suite) return null;
  const tag = suite[0];
  const attr = (name: string): number => {
    const m = tag.match(new RegExp(`${name}="(\\d+)"`));
    return m ? Number(m[1]) : 0;
  };
  const failing: string[] = [];
  // Testcases are matched one element at a time. A passing testcase is
  // self-closing (no </testcase>), so a plain lazy match starting there would
  // swallow following testcases and steal their file/line attributes.
  for (const block of stdout.matchAll(/<testcase\b[^>]*\/>|<testcase\b[^>]*>[\s\S]*?<\/testcase>/g)) {
    const body = block[0];
    const msg = body.match(/<(failure|error)\b[^>]*message="([^"]*)"/);
    if (!msg) continue;
    // file/line live on this testcase's own opening tag, never on a nested one.
    const opening = body.slice(0, body.indexOf(">") + 1);
    const file = opening.match(/\bfile="([^"]*)"/);
    const line = opening.match(/\bline="(\d+)"/);
    const where = file ? `${file[1]}${line ? `:${line[1]}` : ""}` : "testcase";
    failing.push(`${where} ${decodeXmlEntities(msg[2]).split("\n")[0]}`);
    if (failing.length >= 20) break;
  }
  return {
    tests: attr("tests"),
    assertions: attr("assertions"),
    failures: attr("failures"),
    errors: attr("errors"),
    skipped: attr("skipped"),
    failing,
  };
}

export interface TestRunOutcome extends ToolOutcome {
  kind: TestRunnerKind | null;
  summary: TestSummary | null;
}

function formatTestOutcome(kind: TestRunnerKind, summary: TestSummary): TestRunOutcome {
  const skipped = summary.skipped > 0 ? `, ${summary.skipped} skipped` : "";
  const failing = summary.failing.length ? `\n${summary.failing.join("\n")}` : "";
  return {
    text: `${kind}: ${summary.tests} test(s), ${summary.assertions} assertions, ${summary.failures} failures, ${summary.errors} errors${skipped}${failing}`.slice(0, 16000),
    status: "ok",
    findings: summary.failures + summary.errors,
    kind,
    summary,
  };
}

async function runTestCommand(
  binary: string,
  kind: TestRunnerKind,
  args: readonly string[],
  cwd: string,
  timeout: number,
  signal: AbortSignal | undefined,
  runner: CommandRunner,
): Promise<TestRunOutcome> {
  const r = await runner.run(binary, args, cwd, timeout, signal);
  const permission = permissionFailure(r);
  if (permission) {
    return {
      text: `php_test: could not execute the ${kind} binary.\n${r.stderr}`.trim(),
      status: "error",
      findings: 0,
      failure: permission,
      kind,
      summary: null,
    };
  }
  if (r.killed) {
    return {
      text: "php_test: the test run timed out or was aborted.",
      status: "error",
      findings: 0,
      failure: r.aborted ? "aborted" : "timed-out",
      kind,
      summary: null,
    };
  }
  if (isMissingBinary(r) || (!r.ok && r.code === null)) {
    return {
      text: `php_test: could not execute the ${kind} binary.\n${r.stderr}`.trim(),
      status: "error",
      findings: 0,
      failure: isMissingBinary(r) ? "missing-tool" : "execution",
      kind,
      summary: null,
    };
  }
  const summary = parseJUnitReport(r.stdout);
  if (!summary) {
    // exit 2/config errors produce prose, not JUnit - that is an operational failure.
    if (!r.ok) {
      return {
        text: `php_test: the runner failed.\n${`${r.stdout}\n${r.stderr}`.trim().slice(0, 4000)}`,
        status: "error",
        findings: 0,
        failure: "execution",
        kind,
        summary: null,
      };
    }
    return {
      text: `${kind}: exited 0, but no parseable JUnit report was produced - cannot confirm tests actually ran (a filter may have matched nothing).\n${r.stdout.slice(0, 2000)}`.trim(),
      status: "ok",
      findings: 0,
      kind,
      summary: null,
    };
  }
  return formatTestOutcome(kind, summary);
}

function mergeTestOutcomes(kind: TestRunnerKind, outcomes: readonly TestRunOutcome[]): TestRunOutcome {
  const findings = outcomes.reduce((total, outcome) => total + outcome.findings, 0);
  const text = outcomes.map((outcome) => outcome.text).join("\n").slice(0, 16000);
  const summaries = outcomes.map((outcome) => outcome.summary);
  if (summaries.some((summary) => summary === null)) {
    return { text, status: "ok", findings, kind, summary: null };
  }
  const summary: TestSummary = {
    tests: 0,
    assertions: 0,
    failures: 0,
    errors: 0,
    skipped: 0,
    failing: [],
  };
  for (const part of summaries as TestSummary[]) {
    summary.tests += part.tests;
    summary.assertions += part.assertions;
    summary.failures += part.failures;
    summary.errors += part.errors;
    summary.skipped += part.skipped;
    summary.failing.push(...part.failing);
  }
  summary.failing = summary.failing.slice(0, 20);
  return formatTestOutcome(kind, summary);
}

/**
 * Runs the project's test suite via `vendor/bin/pest` or `vendor/bin/phpunit`.
 * The vendor binary is the only allowed entry point (never a bare PATH
 * binary), the working directory is explicit, and the run is time-boxed and
 * abortable. Failing tests are findings, not a tool error. The structured
 * summary lets `php_verify` report counts without re-parsing the text.
 *
 * PHPUnit (and Pest) only executes the first positional test path. Selected
 * test files are therefore run one at a time, sharing a single 300s budget.
 */
export async function runTestSuite(
  rawCwd: string,
  signal?: AbortSignal,
  filter?: string,
  options: { runner?: CommandRunner; paths?: string[] } = {},
): Promise<TestRunOutcome> {
  // Resolve once: the vendor binaries are joined onto this path AND it is
  // the child cwd, so a relative input must not be applied twice.
  const cwd = resolve(rawCwd);
  const pestBin = join(cwd, "vendor/bin/pest");
  const phpunitBin = join(cwd, "vendor/bin/phpunit");
  const [hasPest, hasPhpunit] = await Promise.all([pathExists(pestBin), pathExists(phpunitBin)]);
  const kind: TestRunnerKind | null = hasPest ? "pest" : hasPhpunit ? "phpunit" : null;
  const binary = hasPest ? pestBin : hasPhpunit ? phpunitBin : null;
  if (!binary || !kind) {
    return {
      text: "php_test: no vendor/bin/pest or vendor/bin/phpunit found. Install the dev dependencies (composer require --dev pestphp/pest or phpunit/phpunit) and retry. Tests are never run from a bare PATH binary.",
      status: "error",
      findings: 0,
      failure: "missing-tool",
      kind: null,
      summary: null,
    };
  }
  const baseArgs = ["--log-junit", "php://stdout"];
  if (filter) baseArgs.push("--filter", filter);
  const runner = options.runner ?? execFileRunner;
  const selected = options.paths ?? [];
  if (selected.length <= 1) {
    return runTestCommand(
      binary,
      kind,
      [...baseArgs, ...selected],
      cwd,
      300000,
      signal,
      runner,
    );
  }

  const deadline = Date.now() + 300_000;
  const outcomes: TestRunOutcome[] = [];
  for (const path of selected) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return {
        text: "php_test: the targeted test run exceeded its 300s budget.",
        status: "error",
        findings: 0,
        failure: "timed-out",
        kind,
        summary: null,
      };
    }
    const outcome = await runTestCommand(
      binary,
      kind,
      [...baseArgs, path],
      cwd,
      remaining,
      signal,
      runner,
    );
    if (outcome.status === "error") return outcome;
    outcomes.push(outcome);
  }
  return mergeTestOutcomes(kind, outcomes);
}

export async function phpTest(
  rawCwd: string,
  signal?: AbortSignal,
  filter?: string,
): Promise<ToolOutcome> {
  const { text, status, findings, failure } = await runTestSuite(rawCwd, signal, filter);
  return { text, status, findings, ...(failure ? { failure } : {}) };
}

// ---- composer outdated (read-only, hits the network) ----

export interface OutdatedEntry {
  name: string;
  from: string;
  to: string;
  status: string;
}

/** Parses `composer outdated --direct --format=json`. */
export function parseOutdated(stdout: string): OutdatedEntry[] | null {
  const slice = jsonSlice(stdout, "{", "}");
  if (!slice) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const doc = parsed as { installed?: unknown; latest?: unknown };
  const list =
    Array.isArray(doc.installed) ? doc.installed : Array.isArray(doc.latest) ? doc.latest : null;
  if (!list) return null;
  const out: OutdatedEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as {
      name?: unknown;
      version?: unknown;
      latest?: unknown;
      "latest-status"?: unknown;
    };
    const status = typeof e["latest-status"] === "string" ? e["latest-status"] : "";
    // An entry without status info but with divergent versions is still updateable.
    const updateable = status.length > 0 ? status !== "up-to-date" : String(e.version ?? "") !== String(e.latest ?? "");
    if (!updateable) continue;
    out.push({
      name: String(e.name ?? "?"),
      from: String(e.version ?? "?"),
      to: String(e.latest ?? "?"),
      status,
    });
  }
  return out;
}

export async function composerOutdated(cwd: string, signal?: AbortSignal): Promise<ToolOutcome> {
  const r = await execFileRunner.run("composer", ["outdated", "--direct", "--format=json"], cwd, 120000, signal);
  if (isMissingBinary(r)) {
    return {
      text: `composer outdated could not run:\n${r.stderr.slice(0, 2000) || "composer not found on PATH."}`,
      status: "error",
      findings: 0,
    };
  }
  if (r.killed) {
    return { text: "composer outdated timed out or was aborted.", status: "error", findings: 0 };
  }
  const report = parseOutdated(r.stdout);
  if (!report) {
    return {
      text: `composer outdated could not run:\n${`${r.stdout}\n${r.stderr}`.trim().slice(0, 4000)}\nHint: needs composer.json + network. Run \`composer validate\` first.`,
      status: "error",
      findings: 0,
    };
  }
  if (report.length === 0) {
    return {
      text: "composer outdated --direct: all direct dependencies are up to date.",
      status: "ok",
      findings: 0,
    };
  }
  const lines = report.slice(0, 20).map((e) => `${e.name}: ${e.from} -> ${e.to}${e.status ? ` (${e.status})` : ""}`);
  const more = report.length > lines.length ? `\n... and ${report.length - lines.length} more` : "";
  return {
    text: `composer outdated --direct: ${report.length} direct dependency(ies) have a newer version:\n${lines.join("\n")}${more}`.slice(0, 16000),
    status: "ok",
    findings: report.length,
  };
}

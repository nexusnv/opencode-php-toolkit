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
/** Parsed shape of a `composer audit --format=json` report. */
export type AuditReport = {
    advisories: number;
} | null;
/**
 * Parses an audit report.
 *
 * Returns `null` when the output is not a usable report, so a failed audit is
 * never mistaken for a clean one.
 */
export declare function parseAuditReport(stdout: string): AuditReport;
/** Counts advisories in `composer audit --format=json` output. */
export declare function countAdvisories(stdout: string): number;
export declare function phpLint(paths: string[], cwd: string, signal?: AbortSignal): Promise<ToolOutcome>;
export declare function composerValidate(cwd: string, signal?: AbortSignal): Promise<ToolOutcome>;
export declare function composerAudit(cwd: string, signal?: AbortSignal): Promise<ToolOutcome>;
export type StaticAnalysisSelection = "auto" | "phpstan" | "psalm";
export interface AnalysisReport {
    findings: number;
    /** Up to 20 rendered "file:line problem" lines, for display. */
    lines: string[];
}
/** Parses the `--error-format=json` output of phpstan (totals + files). */
export declare function parsePhpStanReport(stdout: string): AnalysisReport | null;
/** Parses the `--output-format=json` output of psalm (array of issues). */
export declare function parsePsalmReport(stdout: string): AnalysisReport | null;
export declare function phpStaticAnalysis(cwd: string, signal?: AbortSignal, selection?: StaticAnalysisSelection): Promise<ToolOutcome>;
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
export declare function parseJUnitReport(stdout: string): TestSummary | null;
/**
 * Runs the project's test suite via `vendor/bin/pest` or `vendor/bin/phpunit`.
 * The vendor binary is the only allowed entry point (never a bare PATH
 * binary), the working directory is explicit, and the run is time-boxed and
 * abortable. Failing tests are findings, not a tool error.
 */
export declare function phpTest(cwd: string, signal?: AbortSignal, filter?: string): Promise<ToolOutcome>;
export interface OutdatedEntry {
    name: string;
    from: string;
    to: string;
    status: string;
}
/** Parses `composer outdated --direct --format=json`. */
export declare function parseOutdated(stdout: string): OutdatedEntry[] | null;
export declare function composerOutdated(cwd: string, signal?: AbortSignal): Promise<ToolOutcome>;

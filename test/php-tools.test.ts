import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  composerAudit,
  composerOutdated,
  composerValidate,
  countAdvisories,
  parseAuditReport,
  parseJUnitReport,
  parseOutdated,
  parsePhpStanReport,
  parsePsalmReport,
  phpLint,
  phpStaticAnalysis,
  phpTest,
} from "../src/tools/php-tools.js";

/**
 * The tool tests drive fake `php` and `composer` executables so the suite
 * does not depend on a PHP or Composer installation being present.
 *
 * The fakes are dispatched on the file they are given:
 *   ok.php       -> parses cleanly            (php -l exit 0)
 *   broken.php   -> parse error               (php -l exit 255)
 *   missing.php  -> cannot open the file      (php -l exit 1)
 *   killed.php   -> dies on a signal          (operational failure)
 *
 * The fake composer reads ./composer.json and dispatches on markers in it.
 *   FAKE_INVALID       -> validate fails
 *   FAKE_AUDIT_ERROR   -> audit prints a fragment and fails
 *   FAKE_ADVISORIES    -> audit reports CVEs
 *   FAKE_AUDIT_NO_LOCK -> audit prints prose instead of JSON (exit 0)
 *   FAKE_OUTDATED      -> outdated reports one update-possible and one up-to-date
 */
const FAKE_PHP = `#!/bin/sh
case "$2" in
  *broken*)    echo "PHP Parse error:  syntax error, unexpected token" >&2; exit 255 ;;
  *missing*)   echo "Could not open input file: $2" >&2; exit 1 ;;
  *killed*)    kill -9 $$ ;;
  *)           echo "No syntax errors detected in $2"; exit 0 ;;
esac
`;

const FAKE_COMPOSER = `#!/bin/sh
manifest=./composer.json
case "$1" in
  validate)
    if [ ! -f "$manifest" ]; then
      echo "No composer.json in current directory"; exit 3
    fi
    if grep -q FAKE_INVALID "$manifest"; then
      echo '"'"'"./composer.json" does not contain valid JSON'"'"'; exit 1
    fi
    echo "./composer.json is valid"; exit 0
    ;;
  outdated)
    if grep -q FAKE_OUTDATED "$manifest" 2>/dev/null; then
      printf '{"installed":[{"name":"acme/old","version":"1.0.0","latest":"2.0.0","latest-status":"update-possible"},{"name":"acme/current","version":"1.2.0","latest":"1.2.0","latest-status":"up-to-date"}]}'
      exit 0
    fi
    echo "Could not load composer.json"; exit 1 ;;
  audit)
    if grep -q FAKE_AUDIT_ERROR "$manifest" 2>/dev/null; then
      echo "{"; exit 1
    fi
    if grep -q FAKE_AUDIT_NO_LOCK "$manifest" 2>/dev/null; then
      echo "No packages - skipping audit."; exit 0
    fi
    if grep -q FAKE_ADVISORIES "$manifest" 2>/dev/null; then
      printf '{"advisories":{"pkg/a":[{"advisoryId":"CVE-1"}],"pkg/b":[{"advisoryId":"CVE-2"},{"advisoryId":"CVE-3"}]}}'
      exit 1
    fi
    printf '{"advisories":[]}'; exit 0
    ;;
esac
exit 0
`;

let binDir: string;
const originalPath = process.env.PATH;

function workspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "php-toolkit-test-"));
  for (const [name, body] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, { mode: 0o755 });
    chmodSync(full, 0o755);
  }
  return dir;
}

beforeAll(() => {
  binDir = mkdtempSync(join(tmpdir(), "php-toolkit-bin-"));
  for (const [name, body] of [
    ["php", FAKE_PHP],
    ["composer", FAKE_COMPOSER],
  ]) {
    const file = join(binDir, name);
    writeFileSync(file, body, { mode: 0o755 });
    chmodSync(file, 0o755);
  }
  process.env.PATH = `${binDir}:${originalPath ?? ""}`;
});

afterAll(() => {
  process.env.PATH = originalPath;
});

const VALID_PHP = "<?php\nfunction add(int $a, int $b): int { return $a + $b; }\n";
const BROKEN_PHP = "<?php\nfunction broken( {\n  return 1\n";

describe("phpLint", () => {
  it("reports a clean file as a successful run with no findings", async () => {
    const dir = workspace({ "ok.php": VALID_PHP });
    const outcome = await phpLint(["ok.php"], dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
    expect(outcome.text).toContain("ok.php: OK");
  });

  it("reports a parse error as a finding, not as a tool error", async () => {
    const dir = workspace({ "broken.php": BROKEN_PHP });
    const outcome = await phpLint(["broken.php"], dir);
    // The lint ran fine - the user's file is what is broken.
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(1);
    expect(outcome.text).toContain("broken.php: FAIL");
  });

  it("counts every broken file and still calls the run successful", async () => {
    const dir = workspace({ "ok.php": VALID_PHP, "broken-a.php": BROKEN_PHP, "broken-b.php": BROKEN_PHP });
    const outcome = await phpLint(["ok.php", "broken-a.php", "broken-b.php"], dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(2);
  });

  it("does not count a file it could not read as a finding", async () => {
    const dir = workspace({ "missing.php": VALID_PHP });
    const outcome = await phpLint(["missing.php"], dir);
    expect(outcome.status).toBe("error");
    expect(outcome.findings).toBe(0);
    expect(outcome.text).toContain("COULD NOT LINT");
    // The child's actual stderr is surfaced, not the exec wrapper message.
    expect(outcome.text).toContain("Could not open input file");
    expect(outcome.text).not.toContain("Command failed");
  });

  it("reports a partial run as an error while keeping the findings it made", async () => {
    const dir = workspace({ "ok.php": VALID_PHP, "broken.php": BROKEN_PHP, "missing.php": VALID_PHP });
    const outcome = await phpLint(["ok.php", "broken.php", "missing.php"], dir);
    expect(outcome.status).toBe("error");
    expect(outcome.findings).toBe(1);
  });

  it("treats a file that dies as an operational failure", async () => {
    const dir = workspace({ "killed.php": VALID_PHP });
    const outcome = await phpLint(["killed.php"], dir);
    expect(outcome.status).toBe("error");
    expect(outcome.findings).toBe(0);
  });

  it("explains itself when no paths are given", async () => {
    const outcome = await phpLint([], "/tmp");
    expect(outcome.status).toBe("error");
    expect(outcome.findings).toBe(0);
    expect(outcome.text).toContain("no paths given");
  });

  it("tolerates a malformed path list", async () => {
    const outcome = await phpLint(undefined as unknown as string[], "/tmp");
    expect(outcome.status).toBe("error");
    expect(outcome.findings).toBe(0);
  });

  it("says so when more than 20 paths are given", async () => {
    const files: Record<string, string> = {};
    const paths: string[] = [];
    for (let i = 0; i < 21; i++) {
      const name = `bulk-${String(i).padStart(2, "0")}.php`;
      files[name] = VALID_PHP;
      paths.push(name);
    }
    const dir = workspace(files);
    const outcome = await phpLint(paths, dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.text).toContain("first 20 of 21");
    expect(outcome.text).not.toContain("bulk-20.php");
  });
});

describe("composerValidate", () => {
  it("treats a valid manifest as a clean run", async () => {
    const dir = workspace({ "composer.json": JSON.stringify({ name: "acme/demo" }) });
    const outcome = await composerValidate(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
  });

  it("treats an invalid manifest as a finding, not as a tool error", async () => {
    const dir = workspace({ "composer.json": "FAKE_INVALID" });
    const outcome = await composerValidate(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(1);
    expect(outcome.text).toContain("FAIL");
  });

  it("does not treat a missing manifest as a finding", async () => {
    const outcome = await composerValidate(workspace({}));
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
  });
});

describe("audit report parsing", () => {
  it("counts the advisories in a composer audit report", () => {
    const json = JSON.stringify({
      advisories: {
        "symfony/http-kernel": [{ advisoryId: "CVE-1" }, { advisoryId: "CVE-2" }],
        "laravel/framework": [{ advisoryId: "CVE-3" }],
      },
    });
    expect(countAdvisories(json)).toBe(3);
    expect(parseAuditReport(json)).toEqual({ advisories: 3 });
  });

  it("reports an unusable report as such instead of as zero advisories", () => {
    expect(parseAuditReport("not json at all")).toBeNull();
    expect(parseAuditReport("{")).toBeNull();
    expect(parseAuditReport("{}")).toBeNull();
    expect(parseAuditReport("")).toBeNull();
  });

  it("ignores output without advisories", () => {
    expect(countAdvisories(JSON.stringify({ advisories: {} }))).toBe(0);
  });

  it("survives a report with noise around the json", () => {
    const noisy = `Warning: something\n{"advisories":{"pkg":[{"advisoryId":"CVE-9"}]}}\n`;
    expect(countAdvisories(noisy)).toBe(1);
  });
});

describe("composerAudit", () => {
  it("treats 'No packages' prose output as a clean audit, not a failure", async () => {
    const dir = workspace({ "composer.json": "FAKE_AUDIT_NO_LOCK {\"name\":\"acme/demo\"}" });
    const outcome = await composerAudit(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
    expect(outcome.text).toContain("nothing to audit");
  });

  it("keeps failing closed on real audit output errors", async () => {
    const dir = workspace({ "composer.json": "FAKE_AUDIT_ERROR not-json" });
    const outcome = await composerAudit(dir);
    expect(outcome.status).toBe("error");
    expect(outcome.findings).toBe(0);
  });
});

// Real phpstan shape: totals.errors counts errors NOT tied to a file; the
// per-file errors are counted in totals.file_errors.
const FAKE_PHPSTAN = `#!/bin/sh
cat <<'JSON'
{"totals":{"errors":0,"file_errors":2},"files":{"src/Calculator.php":{"errors":1,"messages":[{"message":"Parameter #1 $a of add expects int, string given.","line":12,"ignorable":false}]},"src/Other.php":{"errors":1,"messages":[{"message":"Method Other::bar() should return int.","line":30,"ignorable":false}]}}}
JSON
exit 1
`;

const FAKE_PHPSTAN_CLEAN = `#!/bin/sh
echo "[OK] No errors"
exit 0
`;

const FAKE_PSALM = `#!/bin/sh
cat <<'JSON'
[{"file_name":"src/Calculator.php","line_from":10,"message":"MixedArgument","type":"MixedArgument"},{"file_name":"src/Other.php","line_from":31,"message":"PossiblyNullArgument","type":"PossiblyNullArgument"}]
JSON
exit 2
`;

const FAKE_PHPUNIT_FAIL = `#!/bin/sh
cat <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
<testsuite name="Test Suite" tests="3" assertions="5" failures="1" errors="0" skipped="0">
<testsuite name="Acme.Tests.PassingTest" tests="1" assertions="3" failures="0" errors="0" skipped="0">
<testcase name="testMultiply" classname="Acme.Tests.PassingTest" file="/tmp/fake/tests/PassingTest.php" line="10" assertions="3"/>
</testsuite>
<testsuite name="Acme.Tests.CalculatorTest" tests="2" assertions="2" failures="1" errors="0" skipped="0">
<testcase name="testAdd" classname="Acme.Tests.CalculatorTest" file="/tmp/fake/tests/CalculatorTest.php" line="22" assertions="2"><failure message="Failed asserting that 3 matches expected 4.">trace</failure></testcase>
</testsuite>
</testsuite>
</testsuites>
XML
exit 1
`;

const FAKE_PHPUNIT_CLEAN = `#!/bin/sh
cat <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="Test Suite" tests="2" assertions="4" failures="0" errors="0" skipped="0"><testcase name="testAdd" classname="Acme.Tests.CalculatorTest" line="20" assertions="4"/></testsuite></testsuites>
XML
exit 0
`;

const FAKE_PHPUNIT_BROKEN = `#!/bin/sh
echo "PHPUnit 10.x - Fatal: configuration file not found"
exit 2
`;

const FAKE_PHPUNIT_NO_TESTS = `#!/bin/sh
echo "No tests executed!"
exit 0
`;

describe("phpStaticAnalysis", () => {
  it("reports phpstan errors as findings", async () => {
    const dir = workspace({ "vendor/bin/phpstan": FAKE_PHPSTAN });
    const outcome = await phpStaticAnalysis(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(2);
    expect(outcome.text).toContain("src/Calculator.php:12");
    expect(outcome.text).toContain("phpstan: 2 error(s)");
  });

  it("reports a clean phpstan run without findings", async () => {
    const dir = workspace({ "vendor/bin/phpstan": FAKE_PHPSTAN_CLEAN });
    const outcome = await phpStaticAnalysis(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
  });

  it("falls back to psalm and reports its issues as findings", async () => {
    const dir = workspace({ "vendor/bin/psalm": FAKE_PSALM });
    const outcome = await phpStaticAnalysis(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(2);
    expect(outcome.text).toContain("MixedArgument");
    expect(outcome.text).toContain("psalm: 2 issue(s)");
  });

  it("fails cleanly when no analyzer is installed", async () => {
    const dir = workspace({});
    const outcome = await phpStaticAnalysis(dir);
    expect(outcome.status).toBe("error");
    expect(outcome.text).toContain("no analyzer found");
  });

  it("honors an explicit analyzer selection", async () => {
    const dir = workspace({ "vendor/bin/psalm": FAKE_PSALM });
    const outcome = await phpStaticAnalysis(dir, undefined, "phpstan");
    expect(outcome.status).toBe("error");
    expect(outcome.text).toContain("phpstan/phpstan");
  });
});

describe("phpTest", () => {
  it("reports failing tests as findings with file and line", async () => {
    const dir = workspace({ "vendor/bin/phpunit": FAKE_PHPUNIT_FAIL });
    const outcome = await phpTest(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(1);
    expect(outcome.text).toContain("1 failures");
    expect(outcome.text).toContain("tests/CalculatorTest.php:22");
  });

  it("reports a clean suite with no findings", async () => {
    const dir = workspace({ "vendor/bin/phpunit": FAKE_PHPUNIT_CLEAN });
    const outcome = await phpTest(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
    expect(outcome.text).toContain("0 failures");
  });

  it("treats a runner that cannot start (exit 2, prose) as a tool error", async () => {
    const dir = workspace({ "vendor/bin/phpunit": FAKE_PHPUNIT_BROKEN });
    const outcome = await phpTest(dir);
    expect(outcome.status).toBe("error");
    expect(outcome.findings).toBe(0);
    expect(outcome.text).toContain("the runner failed");
  });

  it("refuses to run without a vendor binary", async () => {
    const dir = workspace({});
    const outcome = await phpTest(dir);
    expect(outcome.status).toBe("error");
    expect(outcome.text).toContain("never run from a bare PATH binary");
  });

  it("does not spawn the runner when the signal is already aborted", async () => {
    const dir = workspace({ "vendor/bin/phpunit": FAKE_PHPUNIT_CLEAN });
    const controller = new AbortController();
    controller.abort();
    const outcome = await phpTest(dir, controller.signal);
    expect(outcome.status).toBe("error");
    expect(outcome.text).toContain("timed out or was aborted");
  });

  it("does not claim a passing suite when exit 0 produced no JUnit report", async () => {
    const dir = workspace({ "vendor/bin/phpunit": FAKE_PHPUNIT_NO_TESTS });
    const outcome = await phpTest(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
    expect(outcome.text).toContain("cannot confirm tests actually ran");
  });

  it("resolves a relative directory against the process working directory", async () => {
    const dir = workspace({ "vendor/bin/phpunit": FAKE_PHPUNIT_CLEAN });
    const prevCwd = process.cwd();
    process.chdir(dirname(dir));
    try {
      const outcome = await phpTest(basename(dir));
      expect(outcome.status).toBe("ok");
      expect(outcome.findings).toBe(0);
    } finally {
      process.chdir(prevCwd);
    }
  });
});

describe("composerOutdated", () => {
  it("reports direct dependencies with a newer version as findings", async () => {
    const dir = workspace({ "composer.json": "FAKE_OUTDATED {\"name\":\"acme/demo\"}" });
    const outcome = await composerOutdated(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(1);
    expect(outcome.text).toContain("acme/old");
    expect(outcome.text).not.toContain("acme/current");
  });

  it("treats a failed outdated run as an error, not as clean", async () => {
    const dir = workspace({ "composer.json": "{\"name\":\"acme/demo\"}" });
    const outcome = await composerOutdated(dir);
    expect(outcome.status).toBe("error");
  });
});

describe("parsers", () => {
  it("parses phpstan JSON: file errors come from totals.file_errors, not totals.errors", () => {
    const json = JSON.stringify({
      totals: { errors: 1, file_errors: 2 },
      files: {
        "src/A.php": { messages: [{ message: "be careful", line: 7 }, { message: "watch out", line: 9 }] },
      },
    });
    expect(parsePhpStanReport(json)).toEqual({
      findings: 3,
      lines: ["src/A.php:7 be careful", "src/A.php:9 watch out"],
    });
  });

  it("falls back to the message count when totals.file_errors is absent", () => {
    const json = JSON.stringify({
      totals: { errors: 1 },
      files: { "src/A.php": { messages: [{ message: "a", line: 1 }, { message: "b", line: 2 }] } },
    });
    expect(parsePhpStanReport(json)?.findings).toBe(3);
  });

  it("rejects JSON objects that carry no phpstan report fields", () => {
    expect(parsePhpStanReport("{}")).toBeNull();
    expect(parsePhpStanReport(JSON.stringify({ unrelated: true }))).toBeNull();
  });

  it("parses psalm JSON issue arrays", () => {
    const json = JSON.stringify([
      { file_name: "src/A.php", line_from: 3, message: "MixedArgument" },
      { file_name: "src/B.php", line_from: 9, message: "PossiblyUnusedReturnValue" },
    ]);
    expect(parsePsalmReport(json)).toEqual({
      findings: 2,
      lines: ["src/A.php:3 MixedArgument", "src/B.php:9 PossiblyUnusedReturnValue"],
    });
  });

  it("parses junit regardless of attribute order", () => {
    const xml = '<testsuites><testsuite assertions="9" name="t" errors="1" failures="1" tests="4" skipped="2"/></testsuites>';
    expect(parseJUnitReport(xml)).toMatchObject({ tests: 4, assertions: 9, failures: 1, errors: 1, skipped: 2 });
  });

  it("attributes a failure to its own testcase when a passing one precedes it", () => {
    const xml =
      '<testsuite name="t" tests="2" assertions="3" errors="0" failures="1" skipped="0">' +
      '<testcase name="ok" file="/p/PassingTest.php" line="10" assertions="2"/>' +
      '<testcase name="bad" file="/p/FailingTest.php" line="42" assertions="1"><failure message="boom">trace</failure></testcase>' +
      "</testsuite>";
    expect(parseJUnitReport(xml)?.failing).toEqual(["/p/FailingTest.php:42 boom"]);
  });

  it("decodes numeric entities and keeps only the first line of a failure message", () => {
    const xml =
      '<testsuite name="t" tests="1" assertions="1" errors="0" failures="1" skipped="0">' +
      '<testcase name="bad" file="/p/FailingTest.php" line="7" assertions="1">' +
      '<failure message="first line&#10;second &quot;line&quot;">trace</failure>' +
      "</testcase>" +
      "</testsuite>";
    expect(parseJUnitReport(xml)?.failing).toEqual(["/p/FailingTest.php:7 first line"]);
  });

  it("counts every phpstan message when totals are missing, beyond the 20-line cap", () => {
    const files: Record<string, unknown> = {};
    for (let i = 0; i < 25; i++) {
      files[`src/File${i}.php`] = { messages: [{ message: `problem ${i}`, line: i + 1 }] };
    }
    const report = parsePhpStanReport(JSON.stringify({ files }));
    expect(report?.findings).toBe(25);
    expect(report?.lines).toHaveLength(20);
  });

  it("parses outdated payloads and drops up-to-date entries", () => {
    const json = JSON.stringify({
      installed: [
        { name: "acme/old", version: "1.0.0", latest: "2.0.0", "latest-status": "update-possible" },
        { name: "acme/current", version: "1.2.0", latest: "1.2.0", "latest-status": "up-to-date" },
      ],
    });
    expect(parseOutdated(json)).toEqual([{ name: "acme/old", from: "1.0.0", to: "2.0.0", status: "update-possible" }]);
  });

  it("returns null for prose instead of a report", () => {
    expect(parseJUnitReport("PHPUnit 10.x\nNo tests executed")).toBeNull();
    expect(parseOutdated("not json at all")).toBeNull();
    expect(parsePhpStanReport("not json at all")).toBeNull();
    expect(parsePsalmReport("not json at all")).toBeNull();
  });
});

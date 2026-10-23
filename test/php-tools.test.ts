import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composerValidate, countAdvisories, parseAuditReport, phpLint } from "../src/tools/php-tools.js";

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
  audit)
    if grep -q FAKE_AUDIT_ERROR "$manifest" 2>/dev/null; then
      echo "{"; exit 1
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
    writeFileSync(join(dir, name), body);
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

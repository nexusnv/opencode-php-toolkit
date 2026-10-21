import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composerValidate, countAdvisories, phpLint } from "../src/tools/php-tools.js";

function workspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "php-toolkit-test-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

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
    const dir = workspace({ "ok.php": VALID_PHP, "a.php": BROKEN_PHP, "b.php": BROKEN_PHP });
    const outcome = await phpLint(["ok.php", "a.php", "b.php"], dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(2);
  });

  it("explains itself when no paths are given", async () => {
    const outcome = await phpLint([], "/tmp");
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
    expect(outcome.text).toContain("no paths given");
  });

  it("tolerates a malformed path list", async () => {
    const outcome = await phpLint(undefined as unknown as string[], "/tmp");
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
  });
});

describe("composerValidate", () => {
  it("treats a valid manifest as a clean run", async () => {
    const dir = workspace({
      "composer.json": JSON.stringify({ name: "acme/demo", description: "d", license: "MIT" }),
    });
    const outcome = await composerValidate(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(0);
  });

  it("treats an invalid manifest as a finding, not as a tool error", async () => {
    const dir = workspace({ "composer.json": "{ this is not json" });
    const outcome = await composerValidate(dir);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings).toBe(1);
    expect(outcome.text).toContain("FAIL");
  });
});

describe("countAdvisories", () => {
  it("counts the advisories in a composer audit report", () => {
    const json = JSON.stringify({
      advisories: {
        "symfony/http-kernel": [{ advisoryId: "CVE-1" }, { advisoryId: "CVE-2" }],
        "laravel/framework": [{ advisoryId: "CVE-3" }],
      },
    });
    expect(countAdvisories(json)).toBe(3);
  });

  it("ignores output without advisories", () => {
    expect(countAdvisories(JSON.stringify({ advisories: {} }))).toBe(0);
    expect(countAdvisories("{}")).toBe(0);
    expect(countAdvisories("not json at all")).toBe(0);
    expect(countAdvisories("")).toBe(0);
  });

  it("survives a report with noise around the json", () => {
    const noisy = `Warning: something\n{"advisories":{"pkg":[{"advisoryId":"CVE-9"}]}}\n`;
    expect(countAdvisories(noisy)).toBe(1);
  });
});

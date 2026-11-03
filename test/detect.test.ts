import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectPhpProject, formatDetection } from "../src/tools/detect.js";

function workspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "php-toolkit-detect-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

const manifest = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    name: "acme/demo",
    require: { php: ">=8.1" },
    ...extra,
  });

describe("detectPhpProject", () => {
  it("detects Mago installed as carthage-software/mago", async () => {
    const dir = workspace({
      "composer.json": manifest({ "require-dev": { "carthage-software/mago": "^1.0" } }),
    });
    const info = await detectPhpProject(dir);
    expect(info.detectedTools.mago).toBe(true);
  });

  it("reports Mago as absent when it is not a dependency", async () => {
    const dir = workspace({ "composer.json": manifest() });
    const info = await detectPhpProject(dir);
    expect(info.detectedTools.mago).toBe(false);
  });

  it("detects PHPUnit and Larastan as phpstan", async () => {
    const dir = workspace({
      "composer.json": manifest({
        "require-dev": { "phpunit/phpunit": "^10.0", "larastan/larastan": "^2.0" },
      }),
    });
    const info = await detectPhpProject(dir);
    expect(info.detectedTools.phpunit).toBe(true);
    expect(info.detectedTools.phpstan).toBe(true);
  });

  it("detects analyzer configs and composer platform.php", async () => {
    const dir = workspace({
      "composer.json": manifest({ config: { platform: { php: "8.2" } } }),
      "phpstan.neon": "parameters:\n  level: 8\n",
      "rector.php": "<?php\nreturn [];\n",
    });
    const info = await detectPhpProject(dir);
    expect(info.configs).toEqual(expect.arrayContaining(["phpstan.neon", "rector.php"]));
    expect(info.platformPhp).toBe("8.2");
    expect(formatDetection(info)).toContain("phpstan.neon");
    expect(formatDetection(info)).toContain("platform.php: 8.2");
  });

  it("lists no configs for a bare project", async () => {
    const dir = workspace({ "composer.json": manifest() });
    const info = await detectPhpProject(dir);
    expect(info.configs).toEqual([]);
    expect(info.platformPhp).toBeNull();
  });

  it("reports a malformed manifest as a finding instead of as an empty project", async () => {
    const dir = workspace({ "composer.json": "{ this is not json" });
    const info = await detectPhpProject(dir);
    expect(info.hasComposerJson).toBe(true);
    expect(info.composerJsonError).not.toBeNull();
    expect(formatDetection(info)).toContain("MALFORMED");
  });
});

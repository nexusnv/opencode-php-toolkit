import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectPhpProject, formatDetection } from "../src/tools/detect.js";

function workspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "php-toolkit-detect-"));
  for (const [name, body] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
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

  it("accepts array-valued PSR-4 mappings", async () => {
    const dir = workspace({
      "composer.json": manifest({
        autoload: { "psr-4": { "Acme\\": ["src/", "lib/"] } },
      }),
    });
    const info = await detectPhpProject(dir);
    expect(info.autoloadPsr4).toEqual({ "Acme\\": ["src/", "lib/"] });
    expect(formatDetection(info)).toContain("Acme\\=>src/, lib/");
  });

  it("reports a malformed manifest as a finding instead of as an empty project", async () => {
    const dir = workspace({ "composer.json": "{ this is not json" });
    const info = await detectPhpProject(dir);
    expect(info.hasComposerJson).toBe(true);
    expect(info.composerJsonError).not.toBeNull();
    expect(formatDetection(info)).toContain("MALFORMED");
  });

  it("still reports the lock file and configs when the manifest is malformed", async () => {
    const dir = workspace({
      "composer.json": "{ this is not json",
      "composer.lock": "{}",
      "phpstan.neon": "parameters:\n  level: 8\n",
    });
    const info = await detectPhpProject(dir);
    expect(info.composerJsonError).not.toBeNull();
    expect(info.hasComposerLock).toBe(true);
    expect(info.configs).toContain("phpstan.neon");
    expect(formatDetection(info)).toContain("phpstan.neon");
  });

  it("still detects CI conventions when composer.json is malformed", async () => {
    const dir = workspace({
      "composer.json": "{ this is not json",
      ".gitlab-ci.yml": "test:\n  image: php:8.4\n",
    });
    const info = await detectPhpProject(dir);
    expect(info.ci.providers).toEqual(["gitlab-ci"]);
    expect(info.ci.phpVersions).toEqual(["8.4"]);
  });

  it("extracts only script names, known tools, CI providers, PHP versions, and tool conventions", async () => {
    const dir = workspace({
      "composer.json": manifest({ scripts: { test: "vendor/bin/phpunit --testsuite unit", analyse: "vendor/bin/phpstan analyse" } }),
      ".github/workflows/ci.yml": "strategy:\n  matrix:\n    php: ['8.1', '8.2']\nsteps:\n  - run: vendor/bin/pest\n  - run: vendor/bin/phpstan analyse\n  - run: echo $SECRET\n",
      ".gitlab-ci.yml": "test:\n  image: php:8.3\n",
    });
    const info = await detectPhpProject(dir);
    expect(info.scriptNames).toEqual(["analyse", "test"]);
    expect(info.scriptTools).toEqual(["phpunit", "phpstan"]);
    expect(info.ci.providers).toEqual(["github-actions", "gitlab-ci"]);
    expect(info.ci.phpVersions).toEqual(["8.1", "8.2", "8.3"]);
    expect(info.ci.tools).toEqual(["pest", "phpstan"]);
    expect(JSON.stringify(info.ci)).not.toContain("SECRET");
    expect(JSON.stringify(info)).not.toContain("vendor/bin/phpunit --testsuite unit");
    expect(formatDetection(info)).not.toContain("$SECRET");
    expect(formatDetection(info)).not.toContain("vendor/bin/phpstan analyse");
    expect(formatDetection(info)).not.toContain("run: echo");
  });

  it("reads block matrices whose sequence entries share the php key indentation", async () => {
    const dir = workspace({
      ".github/workflows/ci.yml": "strategy:\n  matrix:\n    php:\n    - '8.2'\n    - '8.3'\n  run: echo ok\n",
    });
    const info = await detectPhpProject(dir);
    expect(info.ci.phpVersions).toEqual(["8.2", "8.3"]);
  });

  it("detects block PHP matrices without treating Composer dependency versions as PHP", async () => {
    const dir = workspace({
      "composer.json": manifest({ require: { php: ">=8.1", "vendor/library": "^9.4" } }),
      ".github/workflows/ci.yml": "strategy:\n  matrix:\n    php:\n      - '8.2'\n      - '8.3'\n    dependencies:\n      - '9.4'\nsteps:\n  - run: composer require phpunit/phpunit:^10.4\n",
    });
    const info = await detectPhpProject(dir);
    expect(info.ci.phpVersions).toEqual(["8.2", "8.3"]);
  });
});

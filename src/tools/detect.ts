import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PKG_ROOT } from "../content.js";

export interface PhpProjectInfo {
  hasComposerJson: boolean;
  hasComposerLock: boolean;
  phpRequirement: string | null;
  phpVersion: string | null;
  autoloadPsr4: Record<string, string>;
  require: Record<string, string>;
  requireDev: Record<string, string>;
  scripts: Record<string, string>;
  detectedTools: {
    phpunit: boolean;
    pest: boolean;
    phpstan: boolean;
    psalm: boolean;
    csFixer: boolean;
    phpcs: boolean;
    rector: boolean;
    mago: boolean;
    deptrac: boolean;
    infection: boolean;
  };
  laravelHint: boolean;
  symfonyHint: boolean;
}

function has(deps: Record<string, string>, needle: string): boolean {
  return Object.keys(deps).some((k) => k === needle || k.endsWith("/" + needle));
}

export async function detectPhpProject(directory: string): Promise<PhpProjectInfo> {
  const empty: PhpProjectInfo = {
    hasComposerJson: false,
    hasComposerLock: false,
    phpRequirement: null,
    phpVersion: null,
    autoloadPsr4: {},
    require: {},
    requireDev: {},
    scripts: {},
    detectedTools: {
      phpunit: false,
      pest: false,
      phpstan: false,
      psalm: false,
      csFixer: false,
      phpcs: false,
      rector: false,
      mago: false,
      deptrac: false,
      infection: false,
    },
    laravelHint: false,
    symfonyHint: false,
  };
  try {
    const raw = await readFile(join(directory, "composer.json"), "utf8");
    const composer = JSON.parse(raw) as {
      require?: Record<string, string>;
      ["require-dev"]?: Record<string, string>;
      autoload?: { ["psr-4"]?: Record<string, string> };
      scripts?: Record<string, string | string[]>;
    };
    empty.hasComposerJson = true;
    empty.require = composer.require ?? {};
    empty.requireDev = composer["require-dev"] ?? {};
    empty.phpRequirement = empty.require.php ?? null;
    const psr4 = composer.autoload?.["psr-4"] ?? {};
    empty.autoloadPsr4 = psr4;
    const scripts: Record<string, string> = {};
    for (const [k, v] of Object.entries(composer.scripts ?? {})) {
      scripts[k] = Array.isArray(v) ? v.join(" && ") : String(v);
    }
    empty.scripts = scripts;
    const all = { ...empty.require, ...empty.requireDev };
    empty.detectedTools = {
      phpunit: has(all, "phpunit"),
      pest: has(all, "pest"),
      phpstan: has(all, "phpstan") || has(all, "larastan"),
      psalm: has(all, "psalm"),
      csFixer: has(all, "php-cs-fixer"),
      phpcs: has(all, "phpcs") || has(all, "php_codesniffer"),
      rector: has(all, "rector"),
      mago: false,
      deptrac: has(all, "deptrac"),
      infection: has(all, "infection"),
    };
    empty.laravelHint = has(all, "laravel/framework");
    empty.symfonyHint = Object.keys(all).some((k) => k.startsWith("symfony/"));
  } catch {
    // no composer.json — stay framework-agnostic, report empty
  }
  try {
    const { readFile: rf } = await import("node:fs/promises");
    await rf(join(directory, "composer.lock"), "utf8");
    empty.hasComposerLock = true;
  } catch {
    // no lock
  }
  void PKG_ROOT;
  return empty;
}

export function formatDetection(info: PhpProjectInfo): string {
  const lines = [
    `composer.json: ${info.hasComposerJson ? "yes" : "no"}`,
    `composer.lock: ${info.hasComposerLock ? "yes" : "no"}`,
    `php requirement: ${info.phpRequirement ?? "unknown (recommend >=8.1)"}`,
  ];
  const tools = Object.entries(info.detectedTools)
    .filter(([, v]) => v)
    .map(([k]) => k);
  lines.push(`detected dev tools: ${tools.length ? tools.join(", ") : "none"}`);
  const psr4 = Object.entries(info.autoloadPsr4);
  lines.push(psr4.length ? `psr-4: ${psr4.map(([k, v]) => `${k}=>${v}`).join(", ")}` : "psr-4: not declared");
  if (info.laravelHint) lines.push("note: Laravel detected — this core plugin stays agnostic; use opencode-laravel-toolkit for framework rules.");
  if (info.symfonyHint) lines.push("note: Symfony detected — this core plugin stays agnostic; use opencode-symfony-toolkit for framework rules.");
  if (!info.hasComposerJson) {
    lines.push("hint: run `composer init` and require php >=8.1; add phpunit/pest + phpstan/psalm as dev deps.");
  }
  return lines.join("\n");
}

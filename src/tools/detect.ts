import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PhpProjectInfo {
  hasComposerJson: boolean;
  hasComposerLock: boolean;
  /** Set when composer.json exists but could not be read or parsed. */
  composerJsonError: string | null;
  phpRequirement: string | null;
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
  /** Static-analysis/style-fixer config files present in the project root (just the file names). */
  configs: string[];
  /** composer.json `config.platform.php`, when pinned. */
  platformPhp: string | null;
  laravelHint: boolean;
  symfonyHint: boolean;
}

/** Config files the toolkit knows how to pick up; presence is all that is reported. */
const CONFIG_FILES = [
  "phpstan.neon",
  "phpstan.neon.dist",
  "phpstan.dist.neon",
  "psalm.xml",
  "psalm.xml.dist",
  ".php-cs-fixer.php",
  ".php-cs-fixer.dist.php",
  "rector.php",
] as const;

function has(deps: Record<string, string>, needle: string): boolean {
  return Object.keys(deps).some((k) => k === needle || k.endsWith("/" + needle));
}

export async function detectPhpProject(directory: string): Promise<PhpProjectInfo> {
  const empty: PhpProjectInfo = {
    hasComposerJson: false,
    hasComposerLock: false,
    composerJsonError: null,
    phpRequirement: null,
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
    configs: [],
    platformPhp: null,
    laravelHint: false,
    symfonyHint: false,
  };
  try {
    const raw = await readFile(join(directory, "composer.json"), "utf8");
    let composer: {
      require?: Record<string, string>;
      ["require-dev"]?: Record<string, string>;
      autoload?: { ["psr-4"]?: Record<string, string> };
      scripts?: Record<string, string | string[]>;
      config?: { platform?: { php?: unknown } };
    };
    try {
      composer = JSON.parse(raw) as typeof composer;
    } catch (err) {
      // A malformed manifest is a problem in the project - surface it instead
      // of silently reporting "no composer.json".
      empty.hasComposerJson = true;
      empty.composerJsonError = (err as Error).message;
      return empty;
    }
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
      mago: has(all, "mago"),
      deptrac: has(all, "deptrac"),
      infection: has(all, "infection"),
    };
    empty.laravelHint = has(all, "laravel/framework");
    empty.symfonyHint = Object.keys(all).some((k) => k.startsWith("symfony/"));
    const platform = composer.config?.platform?.php;
    empty.platformPhp = typeof platform === "string" ? platform : null;
  } catch {
    // no composer.json — stay framework-agnostic, report empty
  }
  try {
    // Existence is all we need - readFile would copy the whole lock into memory.
    await access(join(directory, "composer.lock"));
    empty.hasComposerLock = true;
  } catch {
    // no lock
  }
  // Static analysis/fixer configs are common signals - cheap to probe in parallel.
  const present = await Promise.all(
    CONFIG_FILES.map(async (name) => {
      try {
        await access(join(directory, name));
        return name;
      } catch {
        return null;
      }
    }),
  );
  empty.configs = present.filter((name) => name !== null);
  return empty;
}

export function formatDetection(info: PhpProjectInfo): string {
  const lines = [
    `composer.json: ${info.hasComposerJson ? "yes" : "no"}`,
    `composer.lock: ${info.hasComposerLock ? "yes" : "no"}`,
    `php requirement: ${info.phpRequirement ?? "unknown (recommend >=8.1)"}`,
  ];
  if (info.composerJsonError) {
    lines.push(`composer.json: MALFORMED - ${info.composerJsonError}`);
  }
  const tools = Object.entries(info.detectedTools)
    .filter(([, v]) => v)
    .map(([k]) => k);
  lines.push(`detected dev tools: ${tools.length ? tools.join(", ") : "none"}`);
  if (info.configs.length) lines.push(`configs: ${info.configs.join(", ")}`);
  if (info.platformPhp) lines.push(`composer platform.php: ${info.platformPhp}`);
  const psr4 = Object.entries(info.autoloadPsr4);
  lines.push(psr4.length ? `psr-4: ${psr4.map(([k, v]) => `${k}=>${v}`).join(", ")}` : "psr-4: not declared");
  if (info.laravelHint) lines.push("note: Laravel detected — this core plugin stays agnostic; use opencode-laravel-toolkit for framework rules.");
  if (info.symfonyHint) lines.push("note: Symfony detected — this core plugin stays agnostic; use opencode-symfony-toolkit for framework rules.");
  if (!info.hasComposerJson) {
    lines.push("hint: run `composer init` and require php >=8.1; add phpunit/pest + phpstan/psalm as dev deps.");
  }
  return lines.join("\n");
}

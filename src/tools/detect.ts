import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTextPrefix } from "./bounded-read.js";

export interface PhpProjectInfo {
  hasComposerJson: boolean;
  hasComposerLock: boolean;
  /** Set when composer.json exists but could not be read or parsed. */
  composerJsonError: string | null;
  phpRequirement: string | null;
  /** PSR-4 prefixes may map to one or more directories. */
  autoloadPsr4: Record<string, string[]>;
  require: Record<string, string>;
  requireDev: Record<string, string>;
  /** Script names only; bodies remain local to Composer validation. */
  scriptNames: string[];
  scriptTools: string[];
  ci: { providers: string[]; phpVersions: string[]; tools: string[] };
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
    scriptNames: [],
    scriptTools: [],
    ci: { providers: [], phpVersions: [], tools: [] },
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
  // File-existence probes are independent of the manifest. They run first so
  // a malformed composer.json (which returns early) still reports the lock
  // file and analyzer/fixer configs that are actually present.
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
  try {
    const raw = await readFile(join(directory, "composer.json"), "utf8");
    let composer: {
      require?: Record<string, string>;
      ["require-dev"]?: Record<string, string>;
      autoload?: { ["psr-4"]?: Record<string, string | string[]> };
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
      empty.ci = await detectCiConventions(directory);
      return empty;
    }
    empty.hasComposerJson = true;
    empty.require = composer.require ?? {};
    empty.requireDev = composer["require-dev"] ?? {};
    empty.phpRequirement = empty.require.php ?? null;
    const rawPsr4 = composer.autoload?.["psr-4"] ?? {};
    const psr4: Record<string, string[]> = {};
    for (const [prefix, value] of Object.entries(rawPsr4)) {
      if (typeof value === "string") {
        psr4[prefix] = [value];
      } else if (Array.isArray(value)) {
        const paths = value.filter((entry): entry is string => typeof entry === "string");
        if (paths.length > 0) psr4[prefix] = paths;
      }
    }
    empty.autoloadPsr4 = psr4;
    const scripts = composer.scripts ?? {};
    empty.scriptNames = Object.keys(scripts).sort();
    empty.scriptTools = knownTools(Object.values(scripts).flatMap((body) => Array.isArray(body) ? body : [body]));
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
  empty.ci = await detectCiConventions(directory);
  return empty;
}

const KNOWN_TOOLS = ["phpunit", "pest", "phpstan", "psalm", "phpcs", "php-cs-fixer", "rector", "deptrac", "infection", "mago"] as const;

function knownTools(values: unknown[]): string[] {
  const text = values.filter((value): value is string => typeof value === "string").join("\n").toLowerCase();
  return KNOWN_TOOLS.filter((tool) => new RegExp(`(?:^|[^a-z0-9_-])${tool.replaceAll("-", "[-\\s]?")}(?:$|[^a-z0-9_-])`, "i").test(text));
}

async function detectCiConventions(root: string): Promise<{ providers: string[]; phpVersions: string[]; tools: string[] }> {
  const providers: string[] = [];
  const files: string[] = [];
  try {
    const workflows = await readdir(join(root, ".github/workflows"), { withFileTypes: true });
    const names = workflows.filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name)).map((entry) => entry.name).sort().slice(0, 16);
    if (names.length) {
      providers.push("github-actions");
      files.push(...names.map((name) => join(root, ".github/workflows", name)));
    }
  } catch { /* GitHub Actions is not configured. */ }
  const rootCis: Array<[string, string]> = [
    [".gitlab-ci.yml", "gitlab-ci"],
    [".circleci/config.yml", "circleci"],
    ["bitbucket-pipelines.yml", "bitbucket-pipelines"],
    ["azure-pipelines.yml", "azure-pipelines"],
  ];
  for (const [name, provider] of rootCis) {
    try {
      await access(join(root, name));
      providers.push(provider);
      files.push(join(root, name));
    } catch { /* provider manifest is absent. */ }
  }
  const versions = new Set<string>();
  const tools = new Set<string>();
  let totalBytes = 0;
  for (const path of files.slice(0, 20)) {
    const remainingBytes = 1024 * 1024 - totalBytes;
    if (remainingBytes <= 0) break;
    try {
      const text = await readTextPrefix(path, Math.min(128 * 1024, remainingBytes));
      totalBytes += Buffer.byteLength(text, "utf8");
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        const phpKey = line.match(/^(\s*)php(?:[-_]version)?\s*:\s*(.*)$/i);
        if (phpKey) {
          const indent = phpKey[1]!.length;
          const value = phpKey[2]!;
          for (const match of value.matchAll(/\b(?:7|8|9)\.\d+(?:\.\d+)?\b/g)) versions.add(match[0]);
          if (value.trim() === "") {
            for (let nested = index + 1; nested < lines.length; nested += 1) {
              const nestedLine = lines[nested]!;
              if (nestedLine.trim() === "") continue;
              const nestedIndent = nestedLine.match(/^\s*/)?.[0].length ?? 0;
              if (nestedIndent <= indent) break;
              if (/^\s*-\s*/.test(nestedLine)) {
                for (const match of nestedLine.matchAll(/\b(?:7|8|9)\.\d+(?:\.\d+)?\b/g)) versions.add(match[0]);
              }
            }
          }
        }
        for (const match of line.matchAll(/\bphp\s*:\s*["']?v?((?:7|8|9)\.\d+(?:\.\d+)?)/gi)) versions.add(match[1]!);
      }
      for (const tool of knownTools([text])) tools.add(tool);
    } catch { /* unreadable CI files contribute provider presence only. */ }
  }
  return { providers, phpVersions: [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), tools: KNOWN_TOOLS.filter((tool) => tools.has(tool)) };
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
  if (info.scriptNames.length) lines.push(`composer scripts: ${info.scriptNames.join(", ")}`);
  if (info.scriptTools.length) lines.push(`composer script tools: ${info.scriptTools.join(", ")}`);
  if (info.ci.providers.length) lines.push(`CI: ${info.ci.providers.join(", ")}`);
  if (info.ci.phpVersions.length) lines.push(`CI PHP versions: ${info.ci.phpVersions.join(", ")}`);
  if (info.ci.tools.length) lines.push(`CI tools: ${info.ci.tools.join(", ")}`);
  const psr4 = Object.entries(info.autoloadPsr4);
  lines.push(
    psr4.length
      ? `psr-4: ${psr4.map(([k, v]) => `${k}=>${v.join(", ")}`).join(", ")}`
      : "psr-4: not declared",
  );
  if (info.laravelHint) lines.push("note: Laravel detected — this core plugin stays agnostic; use opencode-laravel-toolkit for framework rules.");
  if (info.symfonyHint) lines.push("note: Symfony detected — this core plugin stays agnostic; use opencode-symfony-toolkit for framework rules.");
  if (!info.hasComposerJson) {
    lines.push("hint: run `composer init` and require php >=8.1; add phpunit/pest + phpstan/psalm as dev deps.");
  }
  return lines.join("\n");
}

import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { PKG_ROOT } from "./content.js";
import { detectPhpProject } from "./tools/detect.js";

export type ProjectType = "application" | "library" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type FrameworkHint = "laravel" | "symfony" | "wordpress" | "none";

export interface ProjectProfile {
  root: string;
  subpath: string | null;
  type: ProjectType;
  typeConfidence: Confidence;
  typeEvidence: string[];
  phpRequirement: string | null;
  hasComposerJson: boolean;
  hasComposerLock: boolean;
  autoloadPsr4: Record<string, string[]>;
  packageName: string | null;
  packageType: string | null;
  frameworkHints: FrameworkHint[];
  tools: {
    phpunit: boolean;
    psalm: boolean;
    pest: boolean;
    phpstan: boolean;
    phpcs: boolean;
    csFixer: boolean;
    rector: boolean;
    deptrac: boolean;
    infection: boolean;
  };
  configFiles: {
    phpunit: string | null;
    pest: string | null;
    phpstan: string | null;
    psalm: string | null;
    phpcs: string | null;
    csFixer: string | null;
    deptrac: string | null;
    architecture: string | null;
  };
  layout: {
    sourceRoots: string[];
    testRoots: string[];
    hasPublicIndex: boolean;
    hasConsoleBin: boolean;
    hasMigrations: boolean;
    hasConfigDir: boolean;
    hasTemplates: boolean;
  };
  fingerprint: string;
  lockFingerprint: string | null;
}

let packageVersionPromise: Promise<string> | undefined;

function packageVersion(): Promise<string> {
  packageVersionPromise ??= readFile(join(PKG_ROOT, "package.json"), "utf8")
    .then((raw) => {
      try {
        const parsed = JSON.parse(raw) as { version?: unknown };
        return typeof parsed.version === "string" && parsed.version.length > 0
          ? parsed.version
          : "0.0.0";
      } catch {
        return "0.0.0";
      }
    })
    .catch(() => "0.0.0");
  return packageVersionPromise;
}

const CONFIG_PROBES = {
  phpunit: ["phpunit.xml", "phpunit.xml.dist"],
  pest: ["Pest.php"],
  phpstan: ["phpstan.neon", "phpstan.neon.dist", "phpstan.dist.neon"],
  psalm: ["psalm.xml", "psalm.xml.dist"],
  phpcs: ["phpcs.xml", "phpcs.xml.dist", ".phpcs.xml", ".phpcs.xml.dist"],
  csFixer: [".php-cs-fixer.php", ".php-cs-fixer.dist.php"],
  deptrac: ["deptrac.yaml", "deptrac.yml"],
  architecture: ["php-toolkit.json"],
} as const;

const LAYOUT_MARKERS = [
  "public/index.php",
  "bin/console",
  "config",
  "migrations",
  "templates",
  "views",
  "src",
  "tests",
  "test",
  "spec",
  "CHANGELOG.md",
  "CHANGELOG",
  "UPGRADING.md",
  "UPGRADING",
] as const;

const RELEASE_FILES = ["CHANGELOG.md", "CHANGELOG", "UPGRADING.md", "UPGRADING"] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function firstExisting(root: string, names: readonly string[]): Promise<string | null> {
  for (const name of names) {
    if (await exists(join(root, name))) return name;
  }
  return null;
}

async function sha256(value: string): Promise<string> {
  return createHash("sha256").update(value).digest("hex");
}

function frameworkRuntime(require: Record<string, string>): {
  hints: FrameworkHint[];
  runtime: boolean;
} {
  const hints: FrameworkHint[] = [];
  if (Object.keys(require).some((key) => key === "laravel/framework" || key.startsWith("laravel/"))) {
    hints.push("laravel");
  }
  if (Object.keys(require).some((key) => key.startsWith("symfony/"))) {
    hints.push("symfony");
  }
  if (Object.keys(require).some((key) => key.includes("wordpress"))) {
    hints.push("wordpress");
  }
  return { hints: hints.length ? hints : ["none"], runtime: hints.length > 0 };
}

async function packageShape(root: string): Promise<boolean> {
  const hasSource = await exists(join(root, "src"));
  if (!hasSource) return false;
  const testRoots = await Promise.all(
    ["tests", "test", "spec"].map(async (name) => ((await exists(join(root, name))) ? name : null)),
  );
  if (!testRoots.some((name) => name !== null)) return false;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return false;
  }
  const allowed = new Set(["src", "tests", "test", "spec", "bin", "vendor", "node_modules"]);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (!allowed.has(entry.name)) return false;
  }
  return true;
}

async function releaseMetadata(root: string): Promise<boolean> {
  if (await firstExisting(root, RELEASE_FILES)) return true;
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isFile() &&
        (entry.name.startsWith("CHANGELOG") || entry.name.startsWith("UPGRADING")),
    );
  } catch {
    return false;
  }
}

async function hashedFiles(root: string): Promise<string[]> {
  const configFiles = await probeConfigFiles(root);
  return [
    "composer.json",
    ...Object.values(configFiles).filter((name): name is string => typeof name === "string"),
  ].sort();
}

/** Cheap signature used to decide whether hashing file contents is needed. */
async function contentFileSignature(root: string): Promise<string> {
  const files = await hashedFiles(root);
  const parts = [`package:${await packageVersion()}`];
  for (const name of files) {
    try {
      const info = await stat(join(root, name));
      parts.push(`${name}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`);
    } catch {
      parts.push(`${name}:missing`);
    }
  }
  return parts.join("|");
}

async function computeFingerprint(root: string): Promise<string> {
  const files = await hashedFiles(root);
  const parts: string[] = [await packageVersion()];
  for (const name of files) {
    try {
      parts.push(`${name}\0${await readFile(join(root, name), "utf8")}`);
    } catch {
      // A config that vanished between probing and hashing simply drops out.
    }
  }
  return sha256(parts.join("\0"));
}

async function probeConfigFiles(root: string): Promise<ProjectProfile["configFiles"]> {
  const entries = await Promise.all(
    (Object.keys(CONFIG_PROBES) as Array<keyof typeof CONFIG_PROBES>).map(async (key) => {
      return [key, await firstExisting(root, CONFIG_PROBES[key])] as const;
    }),
  );
  return Object.fromEntries(entries) as ProjectProfile["configFiles"];
}

async function readComposerIdentity(
  root: string,
): Promise<{ packageName: string | null; packageType: string | null }> {
  try {
    const raw = await readFile(join(root, "composer.json"), "utf8");
    const composer = JSON.parse(raw) as { name?: unknown; type?: unknown };
    return {
      packageName: typeof composer.name === "string" ? composer.name : null,
      packageType: typeof composer.type === "string" ? composer.type : null,
    };
  } catch {
    return { packageName: null, packageType: null };
  }
}

async function computeLockFingerprint(root: string): Promise<string | null> {
  try {
    return sha256(await readFile(join(root, "composer.lock"), "utf8"));
  } catch {
    return null;
  }
}

/** Cheap signature used to decide whether composer.lock needs hashing. */
async function lockFileSignature(root: string): Promise<string> {
  try {
    const info = await stat(join(root, "composer.lock"));
    return `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  } catch {
    return "missing";
  }
}

async function computeLayoutMarkerSignature(root: string): Promise<string> {
  const parts: string[] = [];
  for (const marker of LAYOUT_MARKERS) {
    try {
      const info = await stat(join(root, marker));
      parts.push(`${marker}:${info.isDirectory() ? "d" : "f"}:${info.size}:${info.mtimeMs}`);
    } catch {
      parts.push(`${marker}:missing`);
    }
  }
  // packageShape and releaseMetadata classify from the root listing itself:
  // a new `docs` directory or `CHANGELOG.rst` changes the type even when no
  // hashed file does.
  try {
    const entries = await readdir(root, { withFileTypes: true });
    parts.push(
      `root:${entries
        .map((entry) => `${entry.name}:${entry.isDirectory() ? "d" : "f"}`)
        .sort()
        .join(",")}`,
    );
  } catch {
    parts.push("root:missing");
  }
  return parts.join("|");
}

export async function buildProjectProfile(
  root: string,
  subpath: string | null,
): Promise<ProjectProfile> {
  const info = await detectPhpProject(root);
  const configFiles = await probeConfigFiles(root);
  const identity = await readComposerIdentity(root);

  const [hasPublicIndex, hasConsoleBin, hasConfigDir, hasMigrations, templates, views, release] =
    await Promise.all([
      exists(join(root, "public/index.php")),
      exists(join(root, "bin/console")),
      exists(join(root, "config")),
      exists(join(root, "migrations")),
      exists(join(root, "templates")),
      exists(join(root, "views")),
      releaseMetadata(root),
    ]);
  const hasTemplates = templates || views;
  const testRoots = (
    await Promise.all(
      ["tests", "test", "spec"].map(async (name) => ((await exists(join(root, name))) ? name : null)),
    )
  ).filter((name): name is string => name !== null);
  const shape = await packageShape(root);
  const frameworks = frameworkRuntime(info.require);
  const frameworkRuntimePresent = frameworks.runtime;
  const psr4 = info.autoloadPsr4;

  let applicationScore = 0;
  let libraryScore = 0;
  const evidence: string[] = [];

  if (identity.packageType === "project") {
    applicationScore += 3;
    evidence.push("composer:type=project");
  } else if (identity.packageType === "library") {
    libraryScore += 2;
    evidence.push("composer:type=library");
  }
  if (hasPublicIndex) {
    applicationScore += 2;
    evidence.push("layout:public-index");
  }
  if (hasConsoleBin) {
    applicationScore += 2;
    evidence.push("layout:console-bin");
  }
  if (hasConfigDir) {
    applicationScore += 1;
    evidence.push("layout:config-dir");
  }
  if (hasMigrations) {
    applicationScore += 1;
    evidence.push("layout:migrations");
  }
  if (hasTemplates) {
    applicationScore += 1;
    evidence.push("layout:templates");
  }
  if (frameworkRuntimePresent) {
    applicationScore += 1;
    evidence.push("composer:framework-runtime");
  }
  if (!hasPublicIndex && !hasConsoleBin) {
    libraryScore += 1;
    evidence.push("layout:no-entry-point");
  }
  if (shape) {
    libraryScore += 1;
    evidence.push("layout:package-shape");
  }
  if (Object.keys(psr4).length > 0 && !frameworkRuntimePresent) {
    libraryScore += 1;
    evidence.push("composer:no-framework-runtime");
  }
  if (release) {
    libraryScore += 1;
    evidence.push("layout:release-metadata");
  }

  let type: ProjectType = "unknown";
  let typeConfidence: Confidence = "low";
  if (applicationScore >= 3 && applicationScore - libraryScore >= 2) {
    type = "application";
    const margin = applicationScore - libraryScore;
    typeConfidence = margin >= 4 ? "high" : "medium";
  } else if (libraryScore >= 3 && libraryScore - applicationScore >= 2) {
    type = "library";
    const margin = libraryScore - applicationScore;
    typeConfidence = margin >= 4 ? "high" : "medium";
  }

  return {
    root,
    subpath,
    type,
    typeConfidence,
    typeEvidence: evidence,
    phpRequirement: info.phpRequirement,
    hasComposerJson: info.hasComposerJson,
    hasComposerLock: info.hasComposerLock,
    autoloadPsr4: psr4,
    packageName: identity.packageName,
    packageType: identity.packageType,
    frameworkHints: frameworks.hints,
    tools: {
      phpunit: info.detectedTools.phpunit,
      psalm: info.detectedTools.psalm,
      pest: info.detectedTools.pest,
      phpstan: info.detectedTools.phpstan,
      phpcs: info.detectedTools.phpcs,
      csFixer: info.detectedTools.csFixer,
      rector: info.detectedTools.rector,
      deptrac: info.detectedTools.deptrac,
      infection: info.detectedTools.infection,
    },
    configFiles,
    layout: {
      sourceRoots: [...new Set(Object.values(psr4).flat())],
      testRoots,
      hasPublicIndex,
      hasConsoleBin,
      hasMigrations,
      hasConfigDir,
      hasTemplates,
    },
    fingerprint: await computeFingerprint(root),
    lockFingerprint: await computeLockFingerprint(root),
  };
}

function cacheKey(root: string, subpath: string | null): string {
  return `${root}\0${subpath ?? ""}`;
}

export class ProjectProfileCache {
  #items = new Map<string, ProjectProfile>();
  #layoutMarkerSignatures = new Map<string, string>();
  #contentSignatures = new Map<string, string>();
  #lockSignatures = new Map<string, string>();

  get size(): number {
    return this.#items.size;
  }

  async resolve(root: string, subpath: string | null): Promise<ProjectProfile> {
    const key = cacheKey(root, subpath);
    const cached = this.#items.get(key);
    const [contentSignature, lockSignature, markerSignature] = await Promise.all([
      contentFileSignature(root),
      lockFileSignature(root),
      computeLayoutMarkerSignature(root),
    ]);
    if (
      cached &&
      this.#contentSignatures.get(key) === contentSignature &&
      this.#lockSignatures.get(key) === lockSignature &&
      this.#layoutMarkerSignatures.get(key) === markerSignature
    ) {
      return cached;
    }
    const next = await buildProjectProfile(root, subpath);
    this.#layoutMarkerSignatures.set(key, markerSignature);
    this.#contentSignatures.set(key, contentSignature);
    this.#lockSignatures.set(key, lockSignature);
    this.#items.set(key, next);
    return next;
  }

  clear(): void {
    this.#items.clear();
    this.#layoutMarkerSignatures.clear();
    this.#contentSignatures.clear();
    this.#lockSignatures.clear();
  }
}

import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProjectProfile } from "../src/profile.js";
import { createArchitectureCacheKey } from "../src/architecture/cache.js";

const root = process.cwd();
const script = join(root, "scripts/architecture-scan.php");
const fixture = join(root, "fixtures/php-architecture");

async function scan(directory: string, maxFiles?: number) {
  const args = [script, "--directory", directory, "--format", "json"];
  if (maxFiles !== undefined) args.push("--max-files", String(maxFiles));
  const stdout = execFileSync("php", args, { encoding: "utf8", timeout: 5000 });
  return JSON.parse(stdout) as {
    status: string;
    filesScanned: number;
    fingerprints: Record<string, string>;
    truncated: boolean;
    results: Array<{
      kind: "finding" | "hypothesis" | "metric";
      file: string | null;
      message: string;
      evidence?: string;
      candidatePatterns?: string[];
    }>;
    diagnostics: string[];
  };
}

describe("architecture scanner CLI", () => {
  it("reports configured boundary findings and structural metrics", async () => {
    const result = await scan(fixture);
    expect(result.status).toBe("ok");
    expect(result.results.some((item) => item.kind === "finding" && item.message.includes("Domain"))).toBe(true);
    expect(result.results.some((item) => item.kind === "metric" && item.message.includes("class"))).toBe(true);
  });

  it("labels heuristics as hypotheses and ignores PHP strings and comments", async () => {
    const result = await scan(fixture);
    const hypotheses = result.results.filter((item) => item.kind === "hypothesis");
    expect(hypotheses.some((item) => item.candidatePatterns?.length)).toBe(true);
    expect(result.results.some((item) => item.message.includes("Fake\\Class"))).toBe(false);
  });

  it("honors excludes, sorts deterministically, and reports truncation", async () => {
    const first = await scan(fixture, 1);
    const second = await scan(fixture, 1);
    expect(first.truncated).toBe(true);
    expect(first.results).toEqual(second.results);
    expect(first.results.every((item) => !item.file?.includes("Excluded"))).toBe(true);
  });

  it("scans both configured source files and excludes without truncation", async () => {
    const result = await scan(fixture);
    expect(result.filesScanned).toBe(2);
    expect(Object.keys(result.fingerprints)).toHaveLength(2);
    expect(result.results.every((item) => !item.file?.includes("Excluded"))).toBe(true);
  });

  it("disables boundary checks with a diagnostic for malformed config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-"));
    try {
      await cp(join(fixture, "src"), join(directory, "src"), { recursive: true });
      await writeFile(join(directory, "php-toolkit.json"), "{");
      const result = await scan(directory);
      expect(result.status).toBe("error");
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.results.some((item) => item.kind === "finding")).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts an absent architecture section but diagnoses a present section with the wrong shape", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-config-shape-"));
    try {
      await writeFile(join(directory, "Example.php"), "<?php class Example {}\n");
      const absent = await scan(directory);
      expect(absent.status).toBe("ok");
      expect(absent.diagnostics).toEqual([]);
      await writeFile(join(directory, "php-toolkit.json"), JSON.stringify({ architecture: [] }));
      const invalid = await scan(directory);
      expect(invalid.status).toBe("error");
      expect(invalid.diagnostics.join(" ")).toContain("architecture must be an object");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not descend when a queued directory is replaced by an external symlink", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-symlink-race-"));
    const outside = await mkdtemp(join(tmpdir(), "php-architecture-outside-"));
    try {
      await mkdir(join(directory, "src"));
      await writeFile(join(directory, "src/Local.php"), "<?php class Local {}\n");
      await writeFile(join(outside, "External.php"), "<?php class External {}\n");
      const harness = join(directory, "race-harness");
      await writeFile(harness, `<?php
require $argv[1];
$root = $argv[2];
$outside = $argv[3];
$result = findPhpFiles($root, [], 100, static function (string $queued) use ($root, $outside): void {
    if ($queued === $root . DIRECTORY_SEPARATOR . 'src') {
        rename($queued, $root . DIRECTORY_SEPARATOR . 'src-original');
        symlink($outside, $queued);
    }
});
echo json_encode($result, JSON_UNESCAPED_SLASHES), "\\n";
`);
      const stdout = execFileSync("php", [harness, script, directory, outside], { encoding: "utf8", timeout: 5000 });
      const result = JSON.parse(stdout) as { files: string[]; diagnostics: string[] };
      expect(result.files).toEqual([]);
      expect(result.diagnostics.join(" ")).toContain("selected root");
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("reports metadata fingerprints that match key preparation for oversized files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-metadata-fingerprint-"));
    try {
      await writeFile(join(directory, "Large.php"), "x".repeat(1024 * 1024 + 1));
      const identity = await createArchitectureCacheKey(directory, await buildProjectProfile(directory, null));
      const result = await scan(directory);
      expect(identity.mode).toBe("metadata");
      expect(result.status).toBe("ok");
      expect(result.fingerprints).toEqual(identity.fingerprints);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not treat anonymous class bodies or comments as declarations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-"));
    try {
      await cp(join(fixture, "src"), join(directory, "src"), { recursive: true });
      await writeFile(join(directory, "php-toolkit.json"), await readFile(join(fixture, "php-toolkit.json")));
      await writeFile(join(directory, "src/Domain/Text.php"), `<?php\nnamespace App\\Domain;\n// class Fake\\Class extends App\\Infrastructure\\Database\n\$text = "use App\\Infrastructure\\FakeClass;";\nnew class extends \\stdClass {};\n`);
      const result = await scan(directory);
      expect(result.results.some((item) => item.message.includes("FakeClass"))).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("emits the documented heuristic patterns for larger code smells", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-"));
    try {
      await cp(join(fixture, "src"), join(directory, "src"), { recursive: true });
      await writeFile(join(directory, "php-toolkit.json"), await readFile(join(fixture, "php-toolkit.json")));
      const methods = Array.from({ length: 17 }, (_, index) => `    public function method${index}(): void {}\n`).join("");
      const longBody = Array.from({ length: 52 }, () => "        \$value = null;\n").join("");
      const filler = Array.from({ length: 410 }, () => "    // keep the class intentionally large\n").join("");
      const source = `<?php\nnamespace App\\Domain;\nclass PatternExamples {\n    public function __construct(\$a, \$b, \$c, \$d, \$e) {}\n    public function branches(\$state): string {\n        return match (\$state) { 1 => 'one', 2 => 'two', 3 => 'three' };\n    }\n    public function longMethod(): void {\n${longBody}    }\n    public function staticUse(): void { DateTime::createFromFormat('Y', '2020'); }\n${methods}${filler}}\n`;
      await writeFile(join(directory, "src/Domain/Patterns.php"), source);
      const result = await scan(directory);
      const patterns = result.results.flatMap((item) => item.candidatePatterns ?? []);
      expect(patterns).toEqual(expect.arrayContaining([
        "constructor-parameters", "branching-logic", "long-method", "large-public-api", "large-class", "static-singleton-access",
      ]));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("finds forbidden dependencies in grouped use imports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-grouped-"));
    try {
      await writeFile(join(directory, "php-toolkit.json"), JSON.stringify({ architecture: { layers: {
        Domain: { namespaces: ["App\\Domain\\"], mayDependOn: [] },
        Infrastructure: { namespaces: ["App\\Infrastructure\\"], mayDependOn: [] },
      } } }));
      await writeFile(join(directory, "Grouped.php"), `<?php\nnamespace App\\Domain;\nuse App\\Infrastructure\\{Database};\nclass Order extends Database {}\n`);
      const result = await scan(directory);
      expect(result.results.some((item) => item.kind === "finding" && item.message.includes("Infrastructure"))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("checks every ungrouped import and fully qualified declaration reference", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-refs-"));
    try {
      await writeFile(join(directory, "php-toolkit.json"), JSON.stringify({ architecture: { layers: {
        Domain: { namespaces: ["App\\Domain\\"], mayDependOn: [] },
        Infrastructure: { namespaces: ["App\\Infrastructure\\"], mayDependOn: [] },
      } } }));
      await writeFile(join(directory, "Imports.php"), `<?php\nnamespace App\\Domain;\nuse App\\Infrastructure\\Database, App\\Infrastructure\\Gateway;\nclass Order extends \\App\\Infrastructure\\BaseOrder implements \\App\\Infrastructure\\Contract {\n    public function save(\\App\\Infrastructure\\Repository $repository): \\App\\Infrastructure\\Result {}\n}\n`);
      const result = await scan(directory);
      const boundaryFindings = result.results.filter((item) => item.kind === "finding");
      expect(boundaryFindings.some((item) => item.evidence?.endsWith("Database"))).toBe(true);
      expect(boundaryFindings.some((item) => item.evidence?.endsWith("Gateway"))).toBe(true);
      expect(boundaryFindings.some((item) => item.evidence?.endsWith("BaseOrder"))).toBe(true);
      expect(boundaryFindings.some((item) => item.evidence?.endsWith("Contract"))).toBe(true);
      expect(boundaryFindings.some((item) => item.evidence?.endsWith("Repository"))).toBe(true);
      expect(boundaryFindings.some((item) => item.evidence?.endsWith("Result"))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses namespace-scoped imports and exact namespace prefix boundaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-scope-"));
    try {
      await writeFile(join(directory, "php-toolkit.json"), JSON.stringify({ architecture: { layers: {
        Domain: { namespaces: ["App\\Domain\\"], mayDependOn: [] },
        Infrastructure: { namespaces: ["App\\Infrastructure\\"], mayDependOn: [] },
      } } }));
      await writeFile(join(directory, "Scoped.php"), `<?php\nnamespace App\\Domain;\nuse App\\Infrastructure\\Database;\nclass First {}\nnamespace App\\DomainExtra;\nuse App\\Infrastructure\\Gateway;\nclass Second {}\n`);
      const result = await scan(directory);
      const findings = result.results.filter((item) => item.kind === "finding");
      expect(findings).toHaveLength(1);
      expect(findings[0]?.evidence).toContain("Database");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("normalizes safe dot segments in configured excludes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-excludes-"));
    try {
      await cp(join(fixture, "src"), join(directory, "src"), { recursive: true });
      await writeFile(join(directory, "php-toolkit.json"), JSON.stringify({ architecture: { layers: {
        Domain: { namespaces: ["App\\Domain\\"], mayDependOn: [] },
      }, exclude: ["./src/Excluded"] } }));
      const result = await scan(directory);
      expect(result.results.every((item) => !item.file?.includes("Excluded"))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("treats omitted mayDependOn as an empty dependency list", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-default-deps-"));
    try {
      await writeFile(join(directory, "php-toolkit.json"), JSON.stringify({ architecture: { layers: {
        Domain: { namespaces: ["App\\Domain\\"] },
        Infrastructure: { namespaces: ["App\\Infrastructure\\"] },
      } } }));
      await writeFile(join(directory, "Domain.php"), `<?php\nnamespace App\\Domain;\nuse App\\Infrastructure\\Database;\nclass Order extends Database {}\n`);
      const result = await scan(directory);
      expect(result.diagnostics).toEqual([]);
      expect(result.results.some((item) => item.kind === "finding")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

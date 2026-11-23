import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = join(root, "scripts/architecture-scan.php");
const fixture = join(root, "fixtures/php-architecture");

async function scan(directory: string, maxFiles?: number) {
  const args = [script, "--directory", directory, "--format", "json"];
  if (maxFiles !== undefined) args.push("--max-files", String(maxFiles));
  const stdout = execFileSync("php", args, { encoding: "utf8", timeout: 5000 });
  return JSON.parse(stdout) as {
    status: string;
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

  it("disables boundary checks with a diagnostic for malformed config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "php-architecture-"));
    try {
      await cp(join(fixture, "src"), join(directory, "src"), { recursive: true });
      await writeFile(join(directory, "php-toolkit.json"), "{");
      const result = await scan(directory);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.results.some((item) => item.kind === "finding")).toBe(false);
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

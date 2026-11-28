import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProjectProfile } from "../src/profile.js";

const roots: string[] = [];

function project(config?: string): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-config-"));
  roots.push(root);
  if (config !== undefined) writeFileSync(join(root, "php-toolkit.json"), config);
  return root;
}

async function toolkitConfig(root: string) {
  return (await buildProjectProfile(root, null)).toolkitConfig;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("readProjectToolkitConfig", () => {
  it("keeps declared boundaries, safe excludes, and existing routing keys", async () => {
    const root = project(
      JSON.stringify({
        architecture: {
          layers: {
            Domain: { namespaces: ["App\\Domain\\"], mayDependOn: [] },
            Application: { namespaces: ["App\\Application\\"], mayDependOn: ["Domain"] },
          },
          exclude: ["vendor", "var/cache"],
        },
        routing: { disableSkills: ["php-debug"], extraSkills: ["php-testing"] },
        verification: {},
      }),
    );

    const result = await toolkitConfig(root);

    expect(result?.present).toBe(true);
    expect(result?.diagnostics).toEqual([]);
    expect(result?.config.architecture).toEqual({
      layers: {
        Domain: { namespaces: ["App\\Domain\\"], mayDependOn: [] },
        Application: { namespaces: ["App\\Application\\"], mayDependOn: ["Domain"] },
      },
      exclude: ["vendor", "var/cache"],
    });
    expect(result?.config.routing).toEqual({
      disableSkills: ["php-debug"],
      extraSkills: ["php-testing"],
    });
    expect(result?.config.verification).toEqual({ composerScripts: {} });
  });

  it("returns empty defaults when the file is absent", async () => {
    const result = await toolkitConfig(project());

    expect(result).toEqual({
      present: false,
      diagnostics: [],
      config: {
        architecture: null,
        routing: { disableSkills: [], extraSkills: [] },
        verification: null,
      },
    });
  });

  it("disables architecture boundaries for malformed JSON", async () => {
    const result = await toolkitConfig(project("{"));

    expect(result?.present).toBe(true);
    expect(result?.config.architecture).toBeNull();
    expect(result?.diagnostics[0]).toMatch(/^php-toolkit\.json is malformed:/);
  });

  it("disables architecture boundaries when layer dependencies are invalid", async () => {
    const result = await toolkitConfig(
      project(
        JSON.stringify({
          architecture: {
            layers: { Domain: { namespaces: ["App\\Domain\\"], mayDependOn: ["Missing"] } },
          },
        }),
      ),
    );

    expect(result?.config.architecture).toBeNull();
    expect(result?.diagnostics).toContain(
      "architecture layer Domain.mayDependOn references an unknown or identical layer",
    );
  });

  it("disables architecture boundaries when namespaces are duplicated", async () => {
    const result = await toolkitConfig(
      project(
        JSON.stringify({
          architecture: {
            layers: {
              Domain: { namespaces: ["App\\Shared\\"], mayDependOn: [] },
              Infrastructure: { namespaces: ["App\\Shared\\"], mayDependOn: ["Domain"] },
            },
          },
        }),
      ),
    );

    expect(result?.config.architecture).toBeNull();
    expect(result?.diagnostics).toContain(
      "namespace App\\Shared\\ is assigned to both Domain and Infrastructure",
    );
  });

  it("rejects namespace values that are not PHP namespace prefixes", async () => {
    const result = await toolkitConfig(
      project(
        JSON.stringify({
          architecture: { layers: { Domain: { namespaces: ["../Domain"], mayDependOn: [] } } },
        }),
      ),
    );

    expect(result?.config.architecture).toBeNull();
    expect(result?.diagnostics[0]).toContain("needs namespace prefixes");
  });

  it("rejects absolute and parent traversal excludes", async () => {
    const result = await toolkitConfig(
      project(
        JSON.stringify({
          architecture: {
            layers: {},
            exclude: ["../outside"],
          },
        }),
      ),
    );

    expect(result?.config.architecture).toBeNull();
    expect(result?.diagnostics).toContain(
      "architecture.exclude must contain safe project-relative paths",
    );
  });

  it("reports malformed routing and verification sections without throwing", async () => {
    const result = await toolkitConfig(
      project(JSON.stringify({ architecture: { layers: {} }, routing: [], verification: "scripts" })),
    );

    expect(result?.config.architecture).toEqual({ layers: {}, exclude: [] });
    expect(result?.config.routing).toEqual({ disableSkills: [], extraSkills: [] });
    expect(result?.config.verification).toBeNull();
    expect(result?.diagnostics).toContain("routing must be an object; routing overrides are ignored");
    expect(result?.diagnostics).toContain("verification must be an object; verification overrides are ignored");
  });

  it("warns about unknown top-level keys without dropping valid architecture config", async () => {
    const result = await toolkitConfig(
      project(
        JSON.stringify({
          architecture: { layers: { Domain: { namespaces: ["App\\Domain\\"], mayDependOn: [] } } },
          futureFeature: true,
        }),
      ),
    );

    expect(result?.config.architecture?.layers.Domain.namespaces).toEqual(["App\\Domain\\"]);
    expect(result?.diagnostics).toEqual(["unknown php-toolkit.json key ignored: futureFeature"]);
  });

  it("accepts mapped Composer scripts only when each name exists in composer.json", async () => {
    const root = project(JSON.stringify({ verification: { composerScripts: { tests: "test", static: "analyse", style: "cs-check" } } }));
    writeFileSync(join(root, "composer.json"), JSON.stringify({ scripts: { test: "phpunit --testsuite unit", analyse: "phpstan analyse", "cs-check": "php-cs-fixer fix --dry-run" } }));
    const result = await toolkitConfig(root);
    expect(result.config.verification).toEqual({ composerScripts: { tests: "test", static: "analyse", style: "cs-check" } });
    expect(result.diagnostics).toEqual([]);
    expect(JSON.stringify(result.config)).not.toContain("phpunit --testsuite unit");
  });

  it("rejects unsupported and missing Composer script mappings without dropping architecture config", async () => {
    const root = project(JSON.stringify({
      architecture: { layers: { Domain: { namespaces: ["App\\Domain\\"], mayDependOn: [] } } },
      verification: { composerScripts: { test: "test", tests: "missing", style: "" } },
    }));
    writeFileSync(join(root, "composer.json"), JSON.stringify({ scripts: { test: "phpunit" } }));
    const result = await toolkitConfig(root);
    expect(result.config.architecture?.layers.Domain.namespaces).toEqual(["App\\Domain\\"]);
    expect(result.config.verification).toEqual({ composerScripts: {} });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      "verification.composerScripts has unsupported check key: test",
      "verification.composerScripts.tests must name an existing Composer script",
      "verification.composerScripts.style must be a non-empty script name",
    ]));
  });
});

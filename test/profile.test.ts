import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { buildProjectProfile, ProjectProfileCache } from "../src/profile.js";

const fixture = (name: string) => resolve("fixtures", name);

describe("buildProjectProfile", () => {
  it("classifies explicit composer type project as application", async () => {
    const p = await buildProjectProfile(fixture("php-app"), null);
    expect(p.type).toBe("application");
    expect(p.typeConfidence).toBe("high");
    expect(p.typeEvidence).toContain("composer:type=project");
    expect(p.layout.hasPublicIndex).toBe(true);
  });

  it("does not classify an application without Composer type as a library", async () => {
    const p = await buildProjectProfile(fixture("php-app-no-type"), null);
    expect(p.type).toBe("application");
    expect(p.typeEvidence).toContain("layout:public-index");
    expect(p.typeEvidence).not.toContain("composer:type=library");
  });

  it("classifies explicit type library as library", async () => {
    const p = await buildProjectProfile(fixture("php-library"), null);
    expect(p.type).toBe("library");
    expect(p.typeConfidence).toBe("high");
    expect(p.typeEvidence).toContain("composer:type=library");
  });

  it("does not force a package-shaped library without enough evidence into library", async () => {
    const p = await buildProjectProfile(fixture("php-library-no-type"), null);
    expect(p.typeEvidence).toContain("layout:package-shape");
    expect(["library", "unknown"]).toContain(p.type);
  });

  it("returns unknown when evidence is insufficient", async () => {
    const p = await buildProjectProfile(fixture("php-legacy"), null);
    expect(p.type).toBe("unknown");
    expect(p.typeEvidence).toContain("layout:no-entry-point");
  });

  it("detects framework runtime as application evidence", async () => {
    const p = await buildProjectProfile(fixture("php-framework"), null);
    expect(p.frameworkHints).toContain("laravel");
    expect(p.typeEvidence).toContain("composer:framework-runtime");
  });

  it("reports no tools without pretending tooling exists", async () => {
    const p = await buildProjectProfile(fixture("php-no-tools"), null);
    expect(p.tools.phpunit).toBe(false);
    expect(p.tools.phpstan).toBe(false);
    expect(p.phpRequirement).toBe("^8.1");
  });
});

describe("ProjectProfileCache", () => {
  it("does not share entries between roots with the same subpath", async () => {
    const cache = new ProjectProfileCache();
    const a = await cache.resolve(fixture("php-library"), null);
    const b = await cache.resolve(fixture("php-library-no-type"), null);
    expect(a.root).not.toBe(b.root);
    expect(cache.size).toBe(2);
  });
});

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectProfile } from "../src/profile.js";
import type { ChangedScope } from "../src/verify/changed.js";
import { MAX_TARGETED_TESTS, selectTests } from "../src/verify/test-selection.js";

function profile(): ProjectProfile {
  return {
    layout: { sourceRoots: ["src"], testRoots: ["tests"] },
  } as ProjectProfile;
}

function tree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-tests-"));
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "<?php");
  }
  return root;
}

function changed(files: string[], deleted: string[] = []): ChangedScope {
  return { source: "vcs", files, deleted, note: null };
}

describe("selectTests", () => {
  it("maps a production file to the path-preserving test file", async () => {
    const root = tree(["src/Payment/PaymentProcessor.php", "tests/Payment/PaymentProcessorTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/Payment/PaymentProcessor.php"]),
    });
    expect(result).toMatchObject({
      mode: "targeted",
      paths: ["tests/Payment/PaymentProcessorTest.php"],
      direct: 0,
      mapped: 1,
      fallbackReason: null,
    });
  });

  it("finds tests under the Unit/Feature/Integration conventions", async () => {
    const root = tree(["src/Billing/Invoice.php", "tests/Unit/Billing/InvoiceTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/Billing/Invoice.php"]),
    });
    expect(result.paths).toEqual(["tests/Unit/Billing/InvoiceTest.php"]);
    expect(result.mode).toBe("targeted");
  });

  it("finds a test by class name anywhere under the test roots", async () => {
    const root = tree(["src/Billing/Invoice.php", "tests/Feature/Deep/InvoiceTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/Billing/Invoice.php"]),
    });
    expect(result.paths).toEqual(["tests/Feature/Deep/InvoiceTest.php"]);
  });

  it("always includes directly changed test files", async () => {
    const root = tree(["tests/Unit/ExistingTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["tests/Unit/ExistingTest.php"]),
    });
    expect(result).toMatchObject({ mode: "targeted", paths: ["tests/Unit/ExistingTest.php"], direct: 1 });
  });

  it("falls back to the full suite when a changed source has no test", async () => {
    const root = tree(["src/Billing/Invoice.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/Billing/Invoice.php"]),
    });
    expect(result).toMatchObject({
      mode: "full-suite",
      paths: [],
      fallbackReason: "tests:full-suite-fallback",
    });
  });

  it("falls back to the full suite when a source file was deleted", async () => {
    const root = tree(["tests/Unit/Billing/InvoiceTest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed([], ["src/Billing/Invoice.php"]),
    });
    expect(result.mode).toBe("full-suite");
    expect(result.fallbackReason).toBe("tests:full-suite-fallback");
  });

  it("does not run tests when only non-PHP files changed", async () => {
    const root = tree(["src/Billing/Invoice.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["README.md"]),
    });
    expect(result).toMatchObject({ mode: "none", paths: [], fallbackReason: null });
  });

  it("uses conventional source/test roots when the profile has none", async () => {
    const root = tree(["src/A.php", "test/ATest.php"]);
    const result = await selectTests({
      root,
      profile: { layout: { sourceRoots: [], testRoots: [] } } as unknown as ProjectProfile,
      changed: changed(["src/A.php"]),
    });
    expect(result.paths).toEqual(["test/ATest.php"]);
  });

  it("never returns a production source path", async () => {
    const root = tree(["src/A.php", "tests/A/ATest.php"]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/A.php"]),
    });
    for (const path of result.paths) expect(path.startsWith("tests/")).toBe(true);
  });

  it("falls back when a changed PHP file has no detectable source root", async () => {
    const root = tree(["lib/A.php", "tests/BTest.php"]);
    const result = await selectTests({
      root,
      profile: { layout: { sourceRoots: [], testRoots: ["tests"] } } as unknown as ProjectProfile,
      changed: changed(["lib/A.php"]),
    });
    expect(result.mode).toBe("full-suite");
    expect(result.fallbackReason).toBe("tests:full-suite-fallback");
  });

  it("falls back when the candidate set is unreasonably large", async () => {
    const files = Array.from({ length: MAX_TARGETED_TESTS + 1 }, (_, i) => `tests/Unit/T${i}/T${i}Test.php`);
    const root = tree(["src/A.php", ...files]);
    const result = await selectTests({
      root,
      profile: profile(),
      changed: changed(["src/A.php"]),
    });
    expect(result.mode).toBe("full-suite");
  });
});

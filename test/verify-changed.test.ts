import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_SCOPE_FILES,
  isInside,
  listProjectPhpFiles,
  normalizeVcsStatus,
  pathsOverride,
  resolveVerificationRoot,
} from "../src/verify/changed.js";
import type { ProjectProfile } from "../src/profile.js";

const repo = "/repo";

function profileWith(layout: Partial<ProjectProfile["layout"]>): ProjectProfile {
  return {
    layout: { sourceRoots: ["src"], testRoots: ["tests"], ...layout },
  } as ProjectProfile;
}

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "php-toolkit-scope-"));
  for (const [name, body] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

describe("resolveVerificationRoot", () => {
  it("defaults to the session root", () => {
    expect(resolveVerificationRoot(repo)).toEqual({ root: repo });
  });

  it("accepts a subdirectory and an absolute path inside the root", () => {
    expect(resolveVerificationRoot(repo, "packages/app")).toEqual({ root: "/repo/packages/app" });
    expect(resolveVerificationRoot(repo, "/repo/packages/app")).toEqual({ root: "/repo/packages/app" });
  });

  it("rejects paths outside the session root", () => {
    expect(resolveVerificationRoot(repo, "../elsewhere")).toEqual({
      error: "directory must stay inside the session root: ../elsewhere",
    });
    expect(resolveVerificationRoot(repo, "/etc")).toEqual({
      error: "directory must stay inside the session root: /etc",
    });
  });

  it("does not mistake a sibling prefix for a child", () => {
    expect(isInside("/repo/app", "/repo/application/src")).toBe(false);
    expect(isInside("/repo/app", "/repo/app/src")).toBe(true);
  });
});

describe("normalizeVcsStatus", () => {
  it("splits added/modified files from deleted files", () => {
    const scope = normalizeVcsStatus(repo, [
      { file: "src/A.php", status: "modified" },
      { file: "src/B.php", status: "deleted" },
      { file: "src/C.php", status: "added" },
    ]);
    expect(scope).toEqual({
      source: "vcs",
      files: ["src/A.php", "src/C.php"],
      deleted: ["src/B.php"],
      note: null,
    });
  });

  it("normalizes absolute and platform separators", () => {
    const scope = normalizeVcsStatus(repo, [
      { file: "/repo/src/A.php", status: "modified" },
      { file: "src\\B.php", status: "added" },
    ]);
    expect(scope.files).toEqual(["src/A.php", "src/B.php"]);
  });

  it("drops entries outside the root with a note", () => {
    const scope = normalizeVcsStatus(repo, [{ file: "/elsewhere/src/A.php", status: "modified" }]);
    expect(scope.files).toEqual([]);
    expect(scope.note).toContain("outside the verification root");
  });

  it("keeps an empty VCS list as a definite empty scope", () => {
    expect(normalizeVcsStatus(repo, [])).toEqual({
      source: "vcs",
      files: [],
      deleted: [],
      note: null,
    });
  });

  it("caps the file list and says so", () => {
    const data = Array.from({ length: MAX_SCOPE_FILES + 5 }, (_, i) => ({
      file: `src/F${i}.php`,
      status: "modified" as const,
    }));
    const scope = normalizeVcsStatus(repo, data);
    expect(scope.files).toHaveLength(MAX_SCOPE_FILES);
    expect(scope.note).toContain("truncated");
  });
});

describe("pathsOverride", () => {
  it("resolves relative and absolute PHP paths and deduplicates", () => {
    expect(pathsOverride(repo, ["src/A.php", "/repo/src/A.php", "src/B.php"])).toEqual({
      files: ["src/A.php", "src/B.php"],
      ignored: 0,
    });
  });

  it("ignores non-PHP paths instead of passing them to checkers", () => {
    expect(pathsOverride(repo, ["src/A.php", "README.md"])).toEqual({
      files: ["src/A.php"],
      ignored: 1,
    });
  });

  it("rejects an escaping path", () => {
    expect(pathsOverride(repo, ["../escape.php"])).toEqual({
      error: "path escapes the verification root: ../escape.php",
    });
  });
});

describe("listProjectPhpFiles", () => {
  it("lists source and test PHP files, skipping vendor, node_modules, hidden dirs and symlinks", async () => {
    const root = tree({
      "src/A.php": "<?php",
      "tests/ATest.php": "<?php",
      "vendor/lib/V.php": "<?php",
      "node_modules/x/X.php": "<?php",
      ".hidden/H.php": "<?php",
      "README.md": "docs",
    });
    symlinkSync(join(root, "src"), join(root, "tests", "linked"));
    const result = await listProjectPhpFiles(root, profileWith({}));
    expect(result.files).toEqual(["src/A.php", "tests/ATest.php"]);
    expect(result.truncated).toBe(false);
  });

  it("falls back to conventional roots when the profile has none", async () => {
    const root = tree({ "src/A.php": "<?php", "test/BTest.php": "<?php" });
    const result = await listProjectPhpFiles(root, profileWith({ sourceRoots: [], testRoots: [] }));
    expect(result.files).toEqual(["src/A.php", "test/BTest.php"]);
  });

  it("caps the list", async () => {
    const root = tree(
      Object.fromEntries(Array.from({ length: MAX_SCOPE_FILES + 2 }, (_, i) => [`src/F${i}.php`, "<?php"])),
    );
    const result = await listProjectPhpFiles(root, profileWith({}));
    expect(result.files).toHaveLength(MAX_SCOPE_FILES);
    expect(result.truncated).toBe(true);
  });
});

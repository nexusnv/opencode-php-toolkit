import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_SCOPE_FILES,
  isInside,
  canonicalVerificationRoot,
  listProjectPhpFiles,
  normalizeConfiguredRoot,
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
      truncated: false,
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
      truncated: false,
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
  it("resolves relative and absolute PHP paths and deduplicates", async () => {
    expect(await pathsOverride(repo, ["src/A.php", "/repo/src/A.php", "src/B.php"])).toEqual({
      files: ["src/A.php", "src/B.php"],
      ignored: 0,
    });
  });

  it("ignores non-PHP paths instead of passing them to checkers", async () => {
    expect(await pathsOverride(repo, ["src/A.php", "README.md"])).toEqual({
      files: ["src/A.php"],
      ignored: 1,
    });
  });

  it("rejects an escaping path", async () => {
    expect(await pathsOverride(repo, ["../escape.php"])).toEqual({
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
    expect(result.outsideRoots).toBe(0);
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

describe("verification boundaries", () => {
  it("rejects a verification root that is a symlink out of the session root", async () => {
    const base = tree({ "project/src/A.php": "<?php", "outside/src/B.php": "<?php" });
    const root = join(base, "project");
    symlinkSync(join(base, "outside"), join(root, "escape"));
    const result = await canonicalVerificationRoot(root, join(root, "escape"));
    expect("error" in result && result.error).toContain("inside the session root");
  });

  it("accepts a symlink that stays inside the session root", async () => {
    const root = tree({ "packages/app/src/A.php": "<?php" });
    symlinkSync(join(root, "packages", "app"), join(root, "linked-app"));
    const result = await canonicalVerificationRoot(root, join(root, "linked-app"));
    expect(result).toEqual({ root: join(realpathSync(root), "packages", "app") });
  });

  it("rejects explicit paths that traverse an escaping symlink", async () => {
    const root = tree({ "src/A.php": "<?php" });
    const outside = tree({ "evil.php": "<?php" });
    symlinkSync(join(outside, "evil.php"), join(root, "link.php"));
    const result = await pathsOverride(root, ["link.php"], realpathSync(root));
    expect("error" in result && result.error).toContain("through a symlink");
  });

  it("rejects an oversized explicit path list instead of truncating it", async () => {
    const paths = Array.from({ length: MAX_SCOPE_FILES + 1 }, (_, i) => `src/F${i}.php`);
    const result = await pathsOverride(repo, paths);
    expect("error" in result && result.error).toContain("file limit");
  });

  it("rebases worktree-relative VCS paths against a subdirectory root", () => {
    const root = "/repo/packages/app";
    const scope = normalizeVcsStatus(
      root,
      [
        { file: "packages/app/src/A.php", status: "modified" },
        { file: "packages/app/src/Old.php", status: "deleted" },
      ],
      "/repo",
    );
    expect(scope.files).toEqual(["src/A.php"]);
    expect(scope.deleted).toEqual(["src/Old.php"]);
  });

  it("accepts VCS paths already relative to the verification root", () => {
    const root = "/repo/packages/app";
    const scope = normalizeVcsStatus(
      root,
      [
        { file: "src/A.php", status: "modified" },
        { file: "src/Old.php", status: "deleted" },
      ],
      "/repo",
    );
    expect(scope.files).toEqual(["src/A.php"]);
    expect(scope.deleted).toEqual(["src/Old.php"]);
    expect(scope.note).toBeNull();
  });

  it("marks a capped VCS scope as truncated", () => {
    const data = Array.from({ length: MAX_SCOPE_FILES + 1 }, (_, i) => ({
      file: `src/F${i}.php`,
      status: "modified" as const,
    }));
    expect(normalizeVcsStatus(repo, data).truncated).toBe(true);
  });
});

describe("configured roots", () => {
  it("normalizes ./ prefixes and trailing slashes", () => {
    expect(normalizeConfiguredRoot("./src/")).toBe("src");
    expect(normalizeConfiguredRoot("tests//")).toBe("tests");
    expect(normalizeConfiguredRoot(".")).toBe("");
  });

  it("ignores configured roots outside the verification root", async () => {
    const base = tree({ "app/src/A.php": "<?php", "shared/B.php": "<?php" });
    const root = join(base, "app");
    const result = await listProjectPhpFiles(
      root,
      profileWith({ sourceRoots: ["src", "../shared"], testRoots: [] }),
    );
    expect(result.files).toEqual(["src/A.php"]);
    expect(result.outsideRoots).toBe(1);
  });

  it("ignores a configured root that symlinks outside the verification root", async () => {
    const base = tree({ "app/src/A.php": "<?php", "shared/B.php": "<?php" });
    const root = join(base, "app");
    symlinkSync(join(base, "shared"), join(root, "linked"));
    const result = await listProjectPhpFiles(
      root,
      profileWith({ sourceRoots: ["linked"], testRoots: [] }),
    );
    expect(result.files).toEqual([]);
    expect(result.outsideRoots).toBe(1);
  });

  it("ignores a conventional root that symlinks outside the verification root", async () => {
    const base = tree({ "app/keep.php": "<?php", "shared/src/A.php": "<?php" });
    const root = join(base, "app");
    symlinkSync(join(base, "shared", "src"), join(root, "src"));
    const result = await listProjectPhpFiles(
      root,
      profileWith({ sourceRoots: [], testRoots: [] }),
    );
    expect(result.files).toEqual([]);
    expect(result.outsideRoots).toBe(1);
  });

  it("discovers files under a configured ./root/", async () => {
    const root = tree({ "src/A.php": "<?php", "tests/ATest.php": "<?php" });
    const result = await listProjectPhpFiles(
      root,
      profileWith({ sourceRoots: ["./src/"], testRoots: ["./tests/"] }),
    );
    expect(result.files).toEqual(["src/A.php", "tests/ATest.php"]);
  });
});

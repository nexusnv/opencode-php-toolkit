import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProjectProfile } from "../src/profile.js";
import { createArchitectureCacheKey } from "../src/architecture/cache.js";

describe("architecture cache key", () => {
  it("isolates project roots and source content", async () => {
    const roots = await Promise.all([
      mkdtemp(join(tmpdir(), "architecture-a-")),
      mkdtemp(join(tmpdir(), "architecture-b-")),
    ]);
    try {
      for (const root of roots) await writeFile(join(root, "Example.php"), "<?php class Example {}\n");
      const profiles = await Promise.all(roots.map((root) => buildProjectProfile(root, null)));
      const keys = await Promise.all(roots.map((root, index) => createArchitectureCacheKey(root, profiles[index]!)));
      expect(keys[0]!.key).not.toBe(keys[1]!.key);
      await writeFile(join(roots[0]!, "Example.php"), "<?php class Changed {}\n");
      const changed = await createArchitectureCacheKey(roots[0]!, await buildProjectProfile(roots[0]!, null));
      expect(changed.key).not.toBe(keys[0]!.key);
    } finally {
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    }
  });

  it("labels large files as metadata-only and includes config and lock fingerprints", async () => {
    const root = await mkdtemp(join(tmpdir(), "architecture-cache-"));
    try {
      await writeFile(join(root, "Large.php"), "x".repeat(1024 * 1024 + 1));
      const profile = await buildProjectProfile(root, null);
      const metadata = await createArchitectureCacheKey(root, profile);
      expect(metadata.mode).toBe("metadata");
      await writeFile(join(root, "php-toolkit.json"), JSON.stringify({ architecture: { layers: [] } }));
      const configChanged = await createArchitectureCacheKey(root, await buildProjectProfile(root, null));
      expect(configChanged.key).not.toBe(metadata.key);
      await writeFile(join(root, "composer.lock"), "{}\n");
      const lockChanged = await createArchitectureCacheKey(root, await buildProjectProfile(root, null));
      expect(lockChanged.key).not.toBe(configChanged.key);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("caps PHP file discovery to the requested scan size and records truncation", async () => {
    const root = await mkdtemp(join(tmpdir(), "architecture-cache-cap-"));
    try {
      await writeFile(join(root, "A.php"), "<?php class A {}\n");
      await writeFile(join(root, "B.php"), "<?php class B {}\n");
      const profile = await buildProjectProfile(root, null);
      const identity = await createArchitectureCacheKey(root, profile, 1);
      expect(identity.files).toBe(1);
      expect(identity.truncated).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

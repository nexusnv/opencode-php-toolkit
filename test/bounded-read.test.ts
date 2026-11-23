import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readTextPrefix } from "../src/tools/bounded-read.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("readTextPrefix", () => {
  it("returns no more than the requested byte prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "php-toolkit-prefix-"));
    roots.push(root);
    const path = join(root, "workflow.yml");
    await writeFile(path, `php: 8.3\n${"x".repeat(10_000)}`);

    expect(await readTextPrefix(path, 9)).toBe("php: 8.3\n");
  });
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMAND_DEFS, PKG_ROOT, SKILL_IDS, parseFrontmatter } from "../src/content.js";

describe("parseFrontmatter", () => {
  it("returns the raw body when no frontmatter block opens", () => {
    const body = "# Heading\n\ntext\n";
    expect(parseFrontmatter(body)).toEqual({ front: {}, content: body });
  });

  it("parses single-line values that contain colons", () => {
    const { front, content } = parseFrontmatter(
      "---\nname: PHP Testing\ndescription: Use foo: bar and baz\n---\nBody\n",
    );
    expect(front).toEqual({ name: "PHP Testing", description: "Use foo: bar and baz" });
    expect(content).toBe("Body\n");
  });

  it("normalizes CRLF frontmatter without leaking carriage returns", () => {
    const { front, content } = parseFrontmatter(
      "---\r\nname: PHP Testing\r\ndescription: CRLF\r\n---\r\nBody\r\n",
    );
    expect(front).toEqual({ name: "PHP Testing", description: "CRLF" });
    expect(content).toBe("Body\n");
  });

  it("treats --- as a closing delimiter only at a line start", () => {
    const { front, content } = parseFrontmatter(
      "---\nname: Example\ndescription: has --- inline\n---\nBody\n---\nstill body\n",
    );
    expect(front).toEqual({ name: "Example", description: "has --- inline" });
    expect(content).toBe("Body\n---\nstill body\n");
  });

  it("falls back to the whole body when the closing delimiter is missing", () => {
    const body = "---\nname: Example\nBody without close\n";
    expect(parseFrontmatter(body)).toEqual({ front: {}, content: body });
  });

  it("accepts an empty frontmatter block", () => {
    expect(parseFrontmatter("---\n---\nBody\n")).toEqual({ front: {}, content: "Body\n" });
  });

  it("ignores multi-line YAML continuation lines by design", () => {
    const { front } = parseFrontmatter(
      "---\nname: Example\ndescription: first\n  continued second\n---\nBody\n",
    );
    expect(front.description).toBe("first");
    expect(front["continued"]).toBeUndefined();
  });
});

describe("content manifests", () => {
  it("maps every skill id to a file with name and description frontmatter", async () => {
    for (const id of SKILL_IDS) {
      const body = await readFile(join(PKG_ROOT, "skills", id, "SKILL.md"), "utf8");
      expect(body.startsWith("---"), id).toBe(true);
      const { front } = parseFrontmatter(body);
      expect(front.name, id).toBeTruthy();
      expect(front.description, id).toBeTruthy();
    }
  });

  it("maps every command definition to a file with a description", async () => {
    for (const definition of COMMAND_DEFS) {
      const body = await readFile(join(PKG_ROOT, definition.file), "utf8");
      const { front } = parseFrontmatter(body);
      expect(front.description, definition.name).toBeTruthy();
    }
  });
});

import { describe, expect, it } from "vitest";
import { PHP_TRIGGER, isDestructiveShell, mentionsPhp } from "../src/hooks/php-context.js";

describe("PHP_TRIGGER", () => {
  it("matches PHP ecosystem mentions", () => {
    expect(PHP_TRIGGER.test("add a phpunit data provider")).toBe(true);
    expect(PHP_TRIGGER.test("run composer audit")).toBe(true);
  });

  it("does not match unrelated topics", () => {
    expect(PHP_TRIGGER.test("fix the CSS layout")).toBe(false);
  });
});

describe("isDestructiveShell", () => {
  it("flags destructive composer and tool invocations", () => {
    expect(isDestructiveShell({ command: "composer update" })).not.toBeNull();
    expect(isDestructiveShell({ command: "vendor/bin/rector process src" })).not.toBeNull();
    expect(isDestructiveShell({ command: "php-cs-fixer fix src" })).not.toBeNull();
    expect(isDestructiveShell("phpcbf src/")).not.toBeNull();
  });

  it("allows dry-run forms", () => {
    expect(isDestructiveShell({ command: "vendor/bin/rector process src --dry-run" })).toBeNull();
    expect(isDestructiveShell({ command: "php-cs-fixer fix src --dry-run --diff" })).toBeNull();
  });

  it("does not flag benign mentions", () => {
    expect(isDestructiveShell({ command: "cat composer.lock" })).toBeNull();
    expect(isDestructiveShell({ command: "git commit -m 'document rector usage'" })).toBeNull();
  });
});

describe("mentionsPhp", () => {
  const user = (text: string) => ({
    role: "user",
    content: [{ type: "text", text }],
  });

  it("detects PHP mentions in user messages", () => {
    expect(mentionsPhp([user("fix this phpstan failure")])).toBe(true);
    expect(mentionsPhp([user("please update the docs"), user("and run composer audit")])).toBe(true);
  });

  it("ignores assistant and tool messages", () => {
    expect(
      mentionsPhp([{ role: "assistant", content: [{ type: "text", text: "composer would fix this" }] }]),
    ).toBe(false);
  });

  it("ignores ambiguous non-PHP words", () => {
    expect(mentionsPhp([user("summarize the pest control report")])).toBe(false);
    expect(mentionsPhp([user("read psalm 23 out loud")])).toBe(false);
  });

  it("scans long messages beyond any fixed cap", () => {
    expect(mentionsPhp([user(`${"x".repeat(9000)} please run phpstan`)])).toBe(true);
  });

  it("ignores non-text parts and malformed input", () => {
    expect(mentionsPhp([{ role: "user", content: [{ type: "tool-call", input: "composer" }] }])).toBe(false);
    expect(mentionsPhp(undefined)).toBe(false);
    expect(mentionsPhp([null, "garbage", { role: "user", content: "php" }] as never)).toBe(false);
  });
});

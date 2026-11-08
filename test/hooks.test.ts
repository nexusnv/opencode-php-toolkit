import { describe, expect, it } from "vitest";
import { PHP_TRIGGER, isDestructiveShell } from "../src/hooks/php-context.js";

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

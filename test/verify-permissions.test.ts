import { describe, expect, it } from "vitest";
import { commandRules, evaluateCommand } from "../src/verify/permissions.js";

const rule = (action: string, resource: string, effect: string) => ({ action, resource, effect });

describe("evaluateCommand", () => {
  it("reports tool-level-only when the host exposes no command rules", () => {
    expect(evaluateCommand([rule("skill", "php-*", "deny")], "php", ["-l", "a.php"], "/repo")).toEqual({
      decision: "tool-level-only",
    });
  });

  it("allows a matching allow rule", () => {
    const rules = [rule("bash", "php*", "allow")];
    expect(evaluateCommand(rules, "php", ["-l", "a.php"], "/repo").decision).toBe("allow");
  });

  it("denies a matching deny rule", () => {
    const rules = [rule("bash", "vendor/bin/phpunit*", "deny")];
    expect(
      evaluateCommand(rules, "/repo/vendor/bin/phpunit", ["--log-junit", "php://stdout"], "/repo").decision,
    ).toBe("deny");
  });

  it("requires approval for ask", () => {
    const rules = [rule("shell", "composer *", "ask")];
    expect(evaluateCommand(rules, "composer", ["validate"], "/repo").decision).toBe("approval-required");
  });

  it("uses the last matching rule", () => {
    const rules = [
      rule("bash", "php*", "allow"),
      rule("bash", "php -l *", "deny"),
    ];
    expect(evaluateCommand(rules, "php", ["-l", "a.php"], "/repo").decision).toBe("deny");
  });

  it("matches relative vendor binary candidates", () => {
    const rules = [rule("bash", "vendor/bin/phpstan*", "allow")];
    expect(
      evaluateCommand(rules, "/repo/vendor/bin/phpstan", ["analyse"], "/repo").decision,
    ).toBe("allow");
  });

  it("matches vendor basenames with their arguments", () => {
    const deny = [rule("bash", "phpunit *", "deny")];
    expect(
      evaluateCommand(deny, "/repo/vendor/bin/phpunit", ["--log-junit", "php://stdout"], "/repo").decision,
    ).toBe("deny");
    const ask = [rule("bash", "phpstan analyse *", "ask")];
    expect(
      evaluateCommand(ask, "/repo/vendor/bin/phpstan", ["analyse", "src"], "/repo").decision,
    ).toBe("approval-required");
  });
});

describe("commandRules", () => {
  it("keeps only bash/shell rules", () => {
    const rules = [rule("bash", "*", "allow"), rule("skill", "*", "allow"), rule("shel?", "*", "ask")];
    expect(commandRules(rules)).toHaveLength(2);
  });
});

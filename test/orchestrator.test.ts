import { describe, expect, it } from "vitest";
import { runRoutingSafely } from "../src/routing/orchestrator.js";

describe("runRoutingSafely", () => {
  it("returns no attachments when routing throws", async () => {
    const result = await runRoutingSafely(async () => {
      throw new Error("boom");
    });
    expect(result.attach).toEqual([]);
    expect(result.error).toBe("boom");
  });

  it("never removes user-selected skills when router fails", async () => {
    const result = await runRoutingSafely(
      async () => {
        throw new Error("boom");
      },
      [{ id: "php-testing" }],
    );
    expect(result.explicit).toEqual([{ id: "php-testing" }]);
  });
});

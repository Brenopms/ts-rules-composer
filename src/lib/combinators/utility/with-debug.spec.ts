import { describe, vi, beforeEach, it, expect } from "vitest";
import { pass, fail } from "../../helpers";
import { Rule } from "../../types";
import { withDebug } from "./with-debug";

describe("withDebug", () => {
  const mockRule = vi.fn((input: string) =>
    input === "valid" ? pass() : fail("Invalid input"),
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call onStart and onEnd for successful rules", async () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const rule = withDebug(mockRule, {
      name: "test-rule",
      onStart,
      onEnd,
    });

    const result = await rule("valid");

    expect(onStart).toHaveBeenCalledWith("valid", undefined);
    expect(onEnd).toHaveBeenCalledWith(
      "valid",
      pass(),
      undefined,
      expect.objectContaining({
        duration: expect.any(Number),
      }),
    );
    expect(result.status).toBe("passed");
  });

  it("should handle errors with onError callback", async () => {
    const error = new Error("Boom!");
    const failingRule = vi.fn(() => {
      throw error;
    });
    const onError = vi.fn();

    const rule = withDebug(failingRule, {
      onError,
    });

    await expect(rule("input")).rejects.toThrow("Boom!");
    expect(onError).toHaveBeenCalled();
  });

  it("should preserve context", async () => {
    const contextRule: Rule<string, string, { userId: number }> = (
      _input,
      ctx,
    ) => (ctx?.userId === 42 ? pass() : fail("Invalid"));

    const onEnd = vi.fn();
    const rule = withDebug(contextRule, { onEnd });

    await rule("test", { userId: 42 });
    expect(onEnd).toHaveBeenCalledWith(
      "test",
      pass(),
      { userId: 42 },
      expect.anything(),
    );
  });
});

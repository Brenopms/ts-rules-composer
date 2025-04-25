import { describe, beforeEach, it, expect, vi } from "vitest";
import { fail, pass } from "../../helpers";
import { mapError } from "./map-error";

describe("mapError combinator", () => {
  const mockTransform = vi.fn((err: string) => `Mapped: ${err}`);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass through successful results", async () => {
    const passingRule = () => pass();
    const mappedRule = mapError(passingRule, mockTransform);
    const result = await mappedRule({});

    expect(result).toEqual(pass());
    expect(mockTransform).not.toHaveBeenCalled();
  });

  it("should transform failed results", async () => {
    const failingRule = () => fail("Original error");
    const mappedRule = mapError(failingRule, mockTransform);
    const result = await mappedRule({});

    expect(result).toEqual(fail("Mapped: Original error"));
    expect(mockTransform).toHaveBeenCalledWith("Original error");
  });

  it("should preserve context", async () => {
    const context = { userId: 123 };
    const contextAwareRule = vi.fn((_, ctx) =>
      ctx?.userId === 123 ? fail("Original") : pass(),
    );

    const mappedRule = mapError(contextAwareRule, mockTransform);
    await mappedRule({}, context);

    expect(contextAwareRule).toHaveBeenCalledWith({}, context);
    expect(mockTransform).toHaveBeenCalledWith("Original");
  });

  it("should handle async rules", async () => {
    const asyncRule = async () => {
      await Promise.resolve();
      return fail("Async error");
    };

    const mappedRule = mapError(asyncRule, mockTransform);
    const result = await mappedRule({});

    expect(result).toEqual(fail("Mapped: Async error"));
  });

  it("should propagate rule errors (uncaught exceptions)", async () => {
    const errorRule = () => {
      throw new Error("Boom!");
    };

    const mappedRule = mapError(errorRule, mockTransform);
    await expect(mappedRule({})).rejects.toThrow("Boom!");
  });
});

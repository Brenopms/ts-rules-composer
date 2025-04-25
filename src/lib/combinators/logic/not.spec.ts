import { beforeEach, describe, expect, it, vi } from "vitest";
import { pass } from "../../helpers/result/pass";
import { not } from "./not";
import { fail } from "../../helpers/result/fail";

describe("not combinator", () => {
  const mockRule = vi.fn(() => pass());
  const errorMsg = "Inverted error";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should invert pass to fail", async () => {
    const invertedRule = not(mockRule, errorMsg);
    const result = await invertedRule({});

    expect(result).toEqual(fail(errorMsg));
    expect(mockRule).toHaveBeenCalled();
  });

  it("should invert fail to pass", async () => {
    const failingRule = vi.fn(() => fail("Original error"));
    const invertedRule = not(failingRule, errorMsg);
    const result = await invertedRule({});

    expect(result).toEqual(pass());
    expect(failingRule).toHaveBeenCalled();
  });

  it("should preserve context", async () => {
    const context = { userId: 123 };
    const contextAwareRule = vi.fn((_, ctx) =>
      ctx?.userId === 123 ? pass() : fail("Wrong user"),
    );

    const invertedRule = not(contextAwareRule, errorMsg);
    await invertedRule({}, context);

    expect(contextAwareRule).toHaveBeenCalledWith({}, context);
  });

  it("should handle async rules", async () => {
    const asyncRule = vi.fn(async () => {
      await Promise.resolve();
      return pass();
    });

    const invertedRule = not(asyncRule, errorMsg);
    const result = await invertedRule({});

    expect(result).toEqual(fail(errorMsg));
  });

  it("should propagate rule errors", async () => {
    const errorRule = vi.fn(() => {
      throw new Error("Boom!");
    });

    const invertedRule = not(errorRule, errorMsg);
    await expect(invertedRule({})).rejects.toThrow("Boom!");
  });
});

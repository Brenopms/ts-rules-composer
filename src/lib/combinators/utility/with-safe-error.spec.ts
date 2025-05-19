import { describe, it, expect, vi, beforeEach } from "vitest";
import { withSafeError } from "./with-safe-error";
import { pass, fail } from "../../helpers";
import type { Rule, RuleResult } from "../../types";

describe("withSafeError", () => {
  // Mock rules for testing
  const passingRule = vi.fn(() => pass());
  const failingRule = vi.fn(() => fail("Expected error"));
  const errorThrowingRule = vi.fn(() => {
    throw new Error("Boom!");
  });
  const stringThrowingRule = vi.fn(() => {
    throw "Just a string error";
  });
  const objectThrowingRule = vi.fn(() => {
    throw { code: 500, message: "Custom error" };
  });
  const invalidRule = vi.fn(() => "not a RuleResult" as unknown as RuleResult);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Basic functionality tests
  it("should pass through successful results unchanged", async () => {
    const safeRule = withSafeError(passingRule);
    const result = await safeRule({});
    expect(result).toEqual(pass());
  });

  it("should pass through failed results unchanged", async () => {
    const safeRule = withSafeError(failingRule);
    const result = await safeRule({});
    expect(result).toEqual(fail("Expected error"));
  });

  // 2. Error handling tests
  it("should catch Error objects and use their message", async () => {
    const safeRule = withSafeError(errorThrowingRule);
    const result = await safeRule({});
    expect(result).toEqual(fail(new Error("Boom!")));
  });

  it("should catch string errors and preserve them", async () => {
    const safeRule = withSafeError(stringThrowingRule);
    const result = await safeRule({});
    expect(result).toEqual(fail("Just a string error"));
  });

  it("should preserve object error structure", async () => {
    const safeRule = withSafeError(objectThrowingRule);
    const result = await safeRule({});
    expect(result).toEqual(fail({ code: 500, message: "Custom error" }));
  });

  // 3. Invalid rule behavior tests
  it("should handle rules that return invalid results", async () => {
    const safeRule = withSafeError(invalidRule);
    const result = await safeRule({});
    expect(result.status).toBe("failed");
    expect((result as any).error).toEqual(
      new Error("Invalid rule - did not return RuleResult"),
    );
  });

  // 4. Custom error transformation tests
  it("should use custom error transformation when provided", async () => {
    const customTransform = vi.fn((error: unknown) => ({
      code: 500,
      message: String(error),
    }));

    const safeRule = withSafeError(errorThrowingRule, customTransform);
    const result = await safeRule({});

    expect(result).toEqual(
      fail({
        code: 500,
        message: "Error: Boom!",
      }),
    );
    expect(customTransform).toHaveBeenCalledWith(expect.any(Error));
  });

  // 5. Type safety tests
  it("should preserve custom error types when specified", async () => {
    interface CustomError {
      code: number;
      details: string;
    }
    const customError: CustomError = {
      code: 400,
      details: "Validation failed",
    };

    const customErrorRule: Rule<number, CustomError> = () => {
      throw customError;
    };

    const safeRule = withSafeError<number, CustomError>(customErrorRule);
    const result = await safeRule(123);

    expect(result).toEqual(fail(customError));
  });

  // 6. Context handling tests
  it("should pass context to the wrapped rule", async () => {
    const context = { userId: 123 };
    const contextAwareRule = vi.fn((_: unknown, ctx: any) =>
      ctx?.userId === 123 ? pass() : fail("Wrong user"),
    );

    const safeRule = withSafeError(contextAwareRule);
    await safeRule({}, context);
    expect(contextAwareRule).toHaveBeenCalledWith({}, context);
  });

  // 7. Async behavior tests
  it("should handle async rules that throw", async () => {
    const asyncErrorRule = vi.fn(async () => {
      await Promise.resolve();
      throw new Error("Async boom!");
    });

    const safeRule = withSafeError(asyncErrorRule);
    const result = await safeRule({});
    expect(result).toEqual(fail(new Error("Async boom!")));
  });

  // 8. Edge case tests
  it("should handle null/undefined input safely", async () => {
    const safeRule = withSafeError(passingRule);
    await expect(safeRule(null as any)).resolves.not.toThrow();
    await expect(safeRule(undefined as any)).resolves.not.toThrow();
  });
});

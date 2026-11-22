import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, pass } from "../../helpers";
import type { Rule, RuleResult } from "../../types";
import { withSafeError } from "./with-safe-error";

// With the default transform, a caught object is both the payload and the cause.
const caught = (cause: unknown) => ({ ...fail(cause), caughtCause: cause });

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
    expect(result).toEqual(caught(new Error("Boom!")));
  });

  it("should catch string errors and preserve them", async () => {
    const safeRule = withSafeError(stringThrowingRule);
    const result = await safeRule({});
    expect(result).toEqual(caught("Just a string error"));
  });

  it("should preserve object error structure", async () => {
    const safeRule = withSafeError(objectThrowingRule);
    const result = await safeRule({});
    expect(result).toEqual(caught({ code: 500, message: "Custom error" }));
  });

  // 3. Invalid rule behavior tests
  it("should handle rules that return invalid results", async () => {
    const safeRule = withSafeError(invalidRule);
    const result = await safeRule({});
    expect(result.outcome).toBe("failed");
    expect((result as any).error).toEqual(
      new Error("Invalid rule - did not return RuleResult"),
    );
  });

  it.each([
    ["an unknown outcome value", { outcome: "denied" }],
    ['"failed" without an error key', { outcome: "failed" }],
    ["null", null],
    ["an object without outcome", { ok: true }],
    [
      "status and an undefined outcome",
      { status: "passed", outcome: undefined },
    ],
  ])("should reject a result with %s as not a RuleResult", async (_, value) => {
    const safeRule = withSafeError(() => value as unknown as RuleResult);
    const result = await safeRule({});
    expect(result).toEqual(
      caught(new Error("Invalid rule - did not return RuleResult")),
    );
  });

  // 3b. 1.x-shaped results
  it.each([
    ["passed", { status: "passed" }],
    ["failed", { status: "failed", error: "Old error" }],
  ])("should explain a 1.x { status: %s } result", async (_, value) => {
    const safeRule = withSafeError(() => value as unknown as RuleResult);
    const result = await safeRule({});
    expect(result).toEqual(
      caught(
        new Error(
          "Invalid rule - returned a 1.x result ({ status }); 2.0 results use { outcome }",
        ),
      ),
    );
  });

  it("should return a valid result that also has status unchanged", async () => {
    const value = { outcome: "failed", error: "New error", status: 404 };
    const safeRule = withSafeError(() => value as unknown as RuleResult);
    const result = await safeRule({});
    expect(result).toBe(value);
  });

  // 4. Custom error transformation tests
  it("should use custom error transformation when provided", async () => {
    const customTransform = vi.fn((error: unknown) => ({
      code: 500,
      message: String(error),
    }));

    const safeRule = withSafeError(errorThrowingRule, customTransform);
    const result = await safeRule({});

    expect(result).toEqual({
      ...fail({ code: 500, message: "Error: Boom!" }),
      caughtCause: new Error("Boom!"),
    });
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

    expect(result).toEqual(caught(customError));
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
    expect(result).toEqual(caught(new Error("Async boom!")));
  });

  // 8. Caught failures carry their cause (rule-error-provenance)
  describe("caughtCause", () => {
    it("marks a thrown error with the thrown value by identity", async () => {
      const boom = new Error("Boom!");
      const result = await withSafeError(() => {
        throw boom;
      })({});

      expect(result).toStrictEqual({
        outcome: "failed",
        error: boom,
        caughtCause: boom,
      });
      expect((result as { caughtCause: unknown }).caughtCause).toBe(boom);
    });

    it("marks a rejection with the rejected value by identity", async () => {
      const reason = { code: 503 };
      const result = await withSafeError(() => Promise.reject(reason))({});

      expect(Object.hasOwn(result, "caughtCause")).toBe(true);
      expect((result as { caughtCause: unknown }).caughtCause).toBe(reason);
    });

    it("marks `throw undefined` with an own undefined cause", async () => {
      const result = await withSafeError(() => {
        throw undefined;
      })({});

      expect(result).toStrictEqual({
        outcome: "failed",
        error: "undefined",
        caughtCause: undefined,
      });
      expect(Object.hasOwn(result, "caughtCause")).toBe(true);
    });

    it("leaves a business failure unmarked, even with an Error payload", async () => {
      const result = await withSafeError(() => fail(new Error("no")))({});

      expect(Object.hasOwn(result, "caughtCause")).toBe(false);
    });

    it.each([
      [
        "a malformed result",
        "not a RuleResult",
        "Invalid rule - did not return RuleResult",
      ],
      [
        "a 1.x-shaped result",
        { status: "failed", error: "Old error" },
        "Invalid rule - returned a 1.x result ({ status }); 2.0 results use { outcome }",
      ],
    ])(
      "marks %s with the diagnostic Error it builds",
      async (_, value, message) => {
        const payload = { code: "TRANSFORMED" };
        const transform = vi.fn((_error: unknown) => payload);
        const safeRule = withSafeError(
          () => value as unknown as RuleResult<typeof payload>,
          transform,
        );

        const result = await safeRule({});

        expect(transform).toHaveBeenCalledOnce();
        const recorded = transform.mock.calls[0]?.[0];
        expect(recorded).toStrictEqual(new Error(message));
        expect((result as { error: unknown }).error).toBe(payload);
        expect((result as { caughtCause: unknown }).caughtCause).toBe(recorded);
      },
    );

    it("marks with the transform's exception when it throws inside the try", async () => {
      const transformError = new Error("transform failed");
      const transform = vi
        .fn<(error: unknown) => string>()
        .mockImplementationOnce(() => {
          throw transformError;
        })
        .mockImplementation((error) => `handled: ${String(error)}`);
      const safeRule = withSafeError(
        () => "not a RuleResult" as unknown as RuleResult,
        transform,
      );

      const result = await safeRule({});

      expect(transform).toHaveBeenCalledTimes(2);
      expect(transform.mock.calls[1]?.[0]).toBe(transformError);
      expect(result).toStrictEqual({
        outcome: "failed",
        error: "handled: Error: transform failed",
        caughtCause: transformError,
      });
    });

    it("lets a transform that throws in the catch escape", async () => {
      const transformError = new Error("transform failed");
      const safeRule = withSafeError(
        () => {
          throw new Error("Boom!");
        },
        () => {
          throw transformError;
        },
      );

      await expect(safeRule({})).rejects.toBe(transformError);
    });
  });

  // 9. Edge case tests
  it("should handle null/undefined input safely", async () => {
    const safeRule = withSafeError(passingRule);
    await expect(safeRule(null as any)).resolves.not.toThrow();
    await expect(safeRule(undefined as any)).resolves.not.toThrow();
  });
});

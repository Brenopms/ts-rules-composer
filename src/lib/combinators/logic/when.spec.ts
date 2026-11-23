import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "../../helpers/result/fail";
import { pass } from "../../helpers/result/pass";
import type { SafetyOptions } from "../../types/safety-options";
import { when } from "./when";

describe("when combinator", () => {
  const mockRule = vi.fn(() => pass());
  const mockPredicateTrue = vi.fn((_: any) => true);
  const mockPredicateFalse = vi.fn((_: any) => false);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Basic functionality
  it("should apply rule when condition is true", async () => {
    const conditionalRule = when(mockPredicateTrue, mockRule);
    const input = { active: true };

    await conditionalRule(input);

    expect(mockPredicateTrue).toHaveBeenCalledWith(input, undefined);
    expect(mockRule).toHaveBeenCalledWith(input, undefined);
  });

  it("should skip rule when condition is false", async () => {
    const conditionalRule = when(mockPredicateFalse, mockRule);
    const input = { active: false };
    const result = await conditionalRule(input);

    expect(mockPredicateFalse).toHaveBeenCalledWith(input, undefined);
    expect(result).toEqual(pass());
    expect(mockRule).not.toHaveBeenCalled();
  });

  it("should work with async predicates", async () => {
    const conditionalRule = when(async (input: { id: number }) => {
      await Promise.resolve();
      return input.id > 10;
    }, mockRule);

    await conditionalRule({ id: 20 });
    expect(mockRule).toHaveBeenCalled();

    mockRule.mockClear();
    await conditionalRule({ id: 5 });
    expect(mockRule).not.toHaveBeenCalled();
  });

  it("should handle mixed async predicates with sync rules", async () => {
    const conditionalRule = when(async (input: { value: number }) => {
      await Promise.resolve();
      return input.value > 5;
    }, mockRule);

    await conditionalRule({ value: 10 });
    expect(mockRule).toHaveBeenCalled();
  });

  it("should handle falsy conditions", async () => {
    const testCases = [
      { condition: false, shouldRun: false },
      { condition: 0, shouldRun: false },
      { condition: "", shouldRun: false },
      { condition: null, shouldRun: false },
      { condition: undefined, shouldRun: false },
    ];

    for (const { condition, shouldRun } of testCases) {
      const conditionalRule = when(() => condition as any, mockRule);
      await conditionalRule({});
      expect(mockRule.mock.calls.length).toBe(shouldRun ? 1 : 0);
      mockRule.mockClear();
    }
  });

  it("should work with async rules needing context", async () => {
    const context = {
      db: {
        findUser: async (_id: string) => true,
      },
    };
    const validate = when(
      (input: { id: string }) => !!input.id,
      async (input, ctx: any) => {
        const exists = await ctx.db.findUser(input.id);
        return exists ? pass() : fail("Not found");
      },
    );

    await validate({ id: "123" }, context);
  });

  // Error cases
  it("should propagate condition errors", async () => {
    const errorCondition = () => {
      throw new Error("Condition failed");
    };
    const conditionalRule = when(errorCondition, mockRule, {
      errorHandlingMode: "unsafe",
    });

    await expect(conditionalRule({})).resolves.toEqual({
      ...fail(new Error("Condition failed")),
      caughtCause: new Error("Condition failed"),
    });
    expect(mockRule).not.toHaveBeenCalled();
  });

  it("should propagate rule errors when condition passes", async () => {
    const errorRule = () => {
      throw new Error("Rule failed");
    };
    const conditionalRule = when(() => true, errorRule, {
      errorHandlingMode: "unsafe",
    });

    await expect(conditionalRule({})).rejects.toThrow("Rule failed");
  });
});

describe("when with a failing predicate (caughtCause)", () => {
  const boom = new Error("predicate down");
  const throwing = () => {
    throw boom;
  };
  const branchRule = vi.fn(() => pass());
  const build = (
    predicate: (input: unknown) => boolean,
    options?: SafetyOptions<unknown>,
  ) => when(predicate, branchRule, options);
  const causeOf = (result: object) =>
    (result as { caughtCause?: unknown }).caughtCause;

  beforeEach(() => {
    branchRule.mockClear();
  });

  it("returns the caught predicate failure with its cause, runs no rule", async () => {
    const result = await build(throwing)("input");

    expect(result).toStrictEqual({
      outcome: "failed",
      error: boom,
      caughtCause: boom,
    });
    expect(causeOf(result)).toBe(boom);
    expect(branchRule).not.toHaveBeenCalled();
  });

  it("keeps the cause with the predicateErrorTransform payload", async () => {
    const result = await build(throwing, {
      predicateErrorTransform: () => "mapped",
    })("input");

    expect(result).toStrictEqual({
      outcome: "failed",
      error: "mapped",
      caughtCause: boom,
    });
  });

  it("keeps an own undefined cause from `throw undefined`", async () => {
    const result = await build(() => {
      throw undefined;
    })("input");

    expect(Object.hasOwn(result, "caughtCause")).toBe(true);
    expect(causeOf(result)).toBeUndefined();
  });

  it("marks a non-boolean predicate with the diagnostic Error", async () => {
    const result = await build(() => "yes" as unknown as boolean)("input");

    expect(causeOf(result)).toStrictEqual(
      new Error("Predicate must return boolean, got string"),
    );
  });

  it("still marks in unsafe mode (predicates are always safe)", async () => {
    const result = await build(throwing, { errorHandlingMode: "unsafe" })(
      "input",
    );

    expect(causeOf(result)).toBe(boom);
  });
});

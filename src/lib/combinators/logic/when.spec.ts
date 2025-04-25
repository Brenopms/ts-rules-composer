import { beforeEach, describe, expect, it, vi } from "vitest";
import { when } from "./when";
import { pass } from "../../helpers/result/pass";
import { fail } from "../../helpers/result/fail";

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

    expect(mockPredicateTrue).toHaveBeenCalledWith(input);
    expect(mockRule).toHaveBeenCalledWith(input, undefined);
  });

  it("should skip rule when condition is false", async () => {
    const conditionalRule = when(mockPredicateFalse, mockRule);
    const input = { active: false };
    const result = await conditionalRule(input);

    expect(mockPredicateFalse).toHaveBeenCalledWith(input);
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

  it("should pass context to rule but not predicate", async () => {
    const context = { authToken: "xyz" };
    const rule = vi.fn(() => pass());

    await when(mockPredicateTrue, rule)({}, context);

    expect(mockPredicateTrue).toHaveBeenCalledWith({});
    expect(rule).toHaveBeenCalledWith({}, context);
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
    const conditionalRule = when(errorCondition, mockRule);

    expect(conditionalRule({})).rejects.toThrow("Condition failed");
    expect(mockRule).not.toHaveBeenCalled();
  });

  it("should propagate rule errors when condition passes", async () => {
    const errorRule = () => {
      throw new Error("Rule failed");
    };
    const conditionalRule = when(() => true, errorRule);

    expect(conditionalRule({})).rejects.toThrow("Rule failed");
  });
});

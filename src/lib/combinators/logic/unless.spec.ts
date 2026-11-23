import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, pass } from "../../helpers";
import type { Rule } from "../../types";
import type { SafetyOptions } from "../../types/safety-options";
import { unless } from "./unless";

describe("unless combinator", () => {
  const mockRule = vi.fn(() => fail("Rule executed"));
  const isAdmin = (input: { role: string }) => input.role === "admin";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip rule when predicate is true", async () => {
    const validateUnlessAdmin = unless(isAdmin, mockRule);
    const result = await validateUnlessAdmin({ role: "admin" });

    expect(result).toEqual(pass());
    expect(mockRule).not.toHaveBeenCalled();
  });

  it("should run rule when predicate is false", async () => {
    const validateUnlessAdmin = unless(isAdmin, mockRule);
    const result = await validateUnlessAdmin({ role: "user" });

    expect(result).toEqual(fail("Rule executed"));
    expect(mockRule).toHaveBeenCalled();
  });

  it("should pass context to the rule", async () => {
    const context = { logger: console };
    const rule = vi.fn(() => pass());
    const validator = unless(() => false, rule);

    await validator({}, context);
    expect(rule).toHaveBeenCalledWith({}, context);
  });

  it("should handle async predicates", async () => {
    const asyncPredicate = async (input: { id: number }) => {
      await Promise.resolve();
      return input.id > 10;
    };
    const validator = unless(asyncPredicate, mockRule);

    await validator({ id: 5 });
    expect(mockRule).toHaveBeenCalled();
  });

  it("should fail with the predicate error and not run the rule when the predicate throws", async () => {
    const validator = unless(() => {
      throw new Error("predicate broke");
    }, mockRule);

    const result = await validator({ id: 1 });

    expect(result).toEqual({
      ...fail(new Error("predicate broke")),
      caughtCause: new Error("predicate broke"),
    });
    expect(mockRule).not.toHaveBeenCalled();
  });

  // Type safety tests
  it("should enforce predicate input type", () => {
    type StrictInput = { id: string };
    const typedRule: Rule<StrictInput> = () => pass();

    // Valid usage
    unless((input: StrictInput) => !!input.id, typedRule);

    // @ts-expect-error - Should fail if predicate expects wrong type
    unless((input: { other: number }) => true, typedRule);
  });
});

describe("unless with a failing predicate (caughtCause)", () => {
  const boom = new Error("predicate down");
  const throwing = () => {
    throw boom;
  };
  const branchRule = vi.fn(() => pass());
  const build = (
    predicate: (input: unknown) => boolean,
    options?: SafetyOptions<unknown>,
  ) => unless(predicate, branchRule, options);
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

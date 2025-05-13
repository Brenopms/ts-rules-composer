import { describe, vi, beforeEach, it, expect } from "vitest";
import { fail, pass } from "../../helpers";
import type { Rule } from "../../types";
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

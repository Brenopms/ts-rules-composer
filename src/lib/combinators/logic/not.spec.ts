import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { fail, pass } from "../../helpers";
import type { Rule } from "../../types";
import { not } from "./not";

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

  it("keeps the context type of a context-aware rule", async () => {
    type Ctx = { userId: number };
    const ctxRule: Rule<string, string, Ctx> = (_input, ctx) =>
      ctx?.userId === 1 ? pass() : fail("wrong user");

    const inverted = not(ctxRule, errorMsg);

    expectTypeOf(inverted).toEqualTypeOf<Rule<string, string, Ctx>>();
    // @ts-expect-error context must match Ctx, not unknown
    inverted("x", { userId: "not a number" });

    expect(await inverted("x", { userId: 1 })).toEqual(fail(errorMsg));
    expect(await inverted("x", { userId: 2 })).toEqual(pass());
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

  describe("caught failures (three-valued)", () => {
    const outage = new Error("down");
    const down: Rule<unknown> = () => {
      throw outage;
    };
    const causeOf = (result: unknown) =>
      (result as { caughtCause: unknown }).caughtCause;

    it("keeps a caught failure instead of passing", async () => {
      const result = await not(down, errorMsg)({});

      expect(result).toStrictEqual({
        outcome: "failed",
        error: outage,
        caughtCause: outage,
      });
      expect(causeOf(result)).toBe(outage);
    });

    it("returns the child's caught result object unchanged", async () => {
      const caught = { outcome: "failed", error: "e", caughtCause: outage };
      const result = await not(() => caught as never, errorMsg)({});

      expect(result).toBe(caught);
    });

    it("keeps a caught failure under double negation", async () => {
      const result = await not(not(down, "inner"), errorMsg)({});

      expect(result.outcome).toBe("failed");
      expect(causeOf(result)).toBe(outage);
    });

    it("keeps a caught failure returned through unsafe mode", async () => {
      const caught = { outcome: "failed", error: "e", caughtCause: undefined };
      const result = await not(() => caught as never, errorMsg, {
        errorHandlingMode: "unsafe",
      })({});

      expect(result).toBe(caught);
    });

    it("still inverts a business failure with an Error payload", async () => {
      const denied: Rule<unknown, unknown> = () => fail(new Error("no"));
      const result = await not(denied, errorMsg)({});

      expect(result).toStrictEqual(pass());
    });

    it("leaves its own inversion failure unmarked", async () => {
      const result = await not(mockRule, errorMsg)({});

      expect(result).toStrictEqual(fail(errorMsg));
      expect(Object.hasOwn(result, "caughtCause")).toBe(false);
    });
  });

  it("should propagate rule errors", async () => {
    const errorRule = vi.fn(() => {
      throw new Error("Boom!");
    });

    const invertedRule = not(errorRule, errorMsg, {
      errorHandlingMode: "unsafe",
    });
    await expect(invertedRule({})).rejects.toThrow("Boom!");
  });
});

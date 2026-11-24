import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { fail, pass } from "../../helpers";
import type { Rule, RuleResult } from "../../types";
import { mapError } from "./map-error";
import { withSafeError } from "./with-safe-error";

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

  it("keeps the context type of a context-aware rule", async () => {
    type Ctx = { userId: number };
    const ctxRule: Rule<string, string, Ctx> = (_input, ctx) =>
      ctx?.userId === 1 ? pass() : fail("wrong user");

    const mapped = mapError(ctxRule, (error) => ({ code: error }));

    expectTypeOf(mapped).toEqualTypeOf<Rule<string, { code: string }, Ctx>>();
    // @ts-expect-error context must match Ctx, not unknown
    mapped("x", { userId: "not a number" });

    expect(await mapped("x", { userId: 1 })).toEqual(pass());
    expect(await mapped("x", { userId: 2 })).toEqual(
      fail({ code: "wrong user" }),
    );
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

  describe("caught failures keep their cause", () => {
    const outage = new Error("service down");
    const caughtRule =
      (cause: unknown): Rule<object, string> =>
      () => ({ outcome: "failed", error: "down", caughtCause: cause });

    it("transforms the payload and keeps the cause by identity", async () => {
      const result = await mapError(caughtRule(outage), mockTransform)({});

      expect(result).toStrictEqual({
        outcome: "failed",
        error: "Mapped: down",
        caughtCause: outage,
      });
      expect(Object.hasOwn(result, "caughtCause")).toBe(true);
      expect((result as { caughtCause: unknown }).caughtCause).toBe(outage);
      expect(mockTransform).toHaveBeenCalledOnce();
      expect(mockTransform).toHaveBeenCalledWith("down");
    });

    it("keeps an own undefined cause (throw undefined)", async () => {
      const result = await mapError(caughtRule(undefined), mockTransform)({});

      expect(Object.hasOwn(result, "caughtCause")).toBe(true);
      expect(result).toStrictEqual({
        outcome: "failed",
        error: "Mapped: down",
        caughtCause: undefined,
      });
    });

    it("applies a custom transform that changes the error type", async () => {
      const mapped = mapError(caughtRule(outage), (error) => ({
        code: error.length,
      }));
      const result = await mapped({});

      expectTypeOf(mapped).toEqualTypeOf<Rule<object, { code: number }>>();
      expect(result).toStrictEqual({
        outcome: "failed",
        error: { code: 4 },
        caughtCause: outage,
      });
    });

    it("keeps the cause withSafeError attaches to a throw", async () => {
      const mapped = mapError(
        withSafeError(
          () => {
            throw outage;
          },
          (thrown) => (thrown as Error).message,
        ),
        (error: string) => `Mapped: ${error}`,
      );

      expect(await mapped({})).toStrictEqual({
        outcome: "failed",
        error: "Mapped: service down",
        caughtCause: outage,
      });
    });

    it("keeps the original cause when the transform replaces it", async () => {
      const replacement = new Error("replacement");
      const shared = { outcome: "failed", error: "down", caughtCause: outage };
      const mapped = mapError(
        (): RuleResult<string> => shared as RuleResult<string>,
        (error: string) => {
          shared.caughtCause = replacement;
          return error;
        },
      );
      const result = await mapped({});

      expect((result as { caughtCause: unknown }).caughtCause).toBe(outage);
    });

    it("ignores an inherited caughtCause (not caught)", async () => {
      const inherited = Object.assign(Object.create({ caughtCause: outage }), {
        outcome: "failed",
        error: "down",
      });
      const result = await mapError(
        (): RuleResult<string> => inherited,
        mockTransform,
      )({});

      expect(result).toStrictEqual(fail("Mapped: down"));
      expect(Object.hasOwn(result, "caughtCause")).toBe(false);
    });

    it("unmarked failures carry no caughtCause", async () => {
      const result = await mapError(() => fail("no"), mockTransform)({});

      expect(Object.hasOwn(result, "caughtCause")).toBe(false);
    });
  });

  it("should propagate rule errors (uncaught exceptions)", async () => {
    const errorRule = () => {
      throw new Error("Boom!");
    };

    const mappedRule = mapError(errorRule, mockTransform);
    await expect(mappedRule({})).rejects.toThrow("Boom!");
  });
});

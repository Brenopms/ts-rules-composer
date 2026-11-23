import { describe, expect, expectTypeOf, it } from "vitest";
import type { PredicateResult, RuleResult } from "../../types";
import { caughtFailure, isCaught } from "./caught";
import { fail } from "./fail";
import { pass } from "./pass";

describe("caughtFailure", () => {
  it("builds a failed result carrying the cause by identity", () => {
    const cause = new Error("down");
    const result = caughtFailure("Service unavailable", cause);

    expect(result).toStrictEqual({
      outcome: "failed",
      error: "Service unavailable",
      caughtCause: cause,
    });
    expect(result.caughtCause).toBe(cause);
  });

  it("fits RuleResult and PredicateResult", () => {
    const result = caughtFailure({ code: 503 }, "down");

    expectTypeOf(result).toExtend<RuleResult<{ code: number }>>();
    expectTypeOf(result).toExtend<PredicateResult<{ code: number }>>();
  });
});

describe("isCaught", () => {
  it.each<[string, object, boolean]>([
    ["a caught failure", caughtFailure("e", new Error("down")), true],
    ["own keys with an undefined cause", caughtFailure("e", undefined), true],
    ["a business failure", fail("Too young"), false],
    ["a pass", pass(), false],
    [
      "a passed result with an own cause",
      { outcome: "passed", caughtCause: "x" },
      false,
    ],
    [
      "an inherited outcome and an own cause",
      Object.assign(Object.create({ outcome: "failed" }), {
        error: "e",
        caughtCause: "x",
      }),
      false,
    ],
    [
      "an own outcome and an inherited cause",
      Object.assign(Object.create({ caughtCause: "x" }), {
        outcome: "failed",
        error: "e",
      }),
      false,
    ],
  ])("%s → %s", (_, result, expected) => {
    expect(isCaught(result)).toBe(expected);
  });
});

describe("the caughtCause field", () => {
  it("is an optional readonly unknown on the failed arm only", () => {
    type RuleFailed = Extract<RuleResult, { outcome: "failed" }>;
    type PredicateFailed = Extract<PredicateResult, { outcome: "failed" }>;

    expectTypeOf<RuleFailed>().toHaveProperty("caughtCause");
    expectTypeOf<PredicateFailed>().toHaveProperty("caughtCause");
    expectTypeOf<Pick<RuleFailed, "caughtCause">>().toEqualTypeOf<{
      readonly caughtCause?: unknown;
    }>();
    expectTypeOf<Pick<PredicateFailed, "caughtCause">>().toEqualTypeOf<{
      readonly caughtCause?: unknown;
    }>();
    expectTypeOf<
      Extract<RuleResult, { outcome: "passed" }>
    >().not.toHaveProperty("caughtCause");
  });

  it("leaves results without the field valid", () => {
    const failed: RuleResult = { outcome: "failed", error: "e" };
    const predicate: PredicateResult = { outcome: "failed", error: "e" };

    expect([failed, predicate]).toHaveLength(2);
    expectTypeOf(fail("e")).toEqualTypeOf<RuleResult>();
    expectTypeOf(pass()).toEqualTypeOf<RuleResult>();
  });
});

import { describe, expect, expectTypeOf, it } from "vitest";
import type { RuleResult } from "../../types";
import { fail } from "./fail";

describe("fail", () => {
  it("builds a failed result carrying the error", () => {
    expect(fail("Invalid input")).toStrictEqual({
      outcome: "failed",
      error: "Invalid input",
    });
  });

  it("keeps a structured error as is", () => {
    const error = { code: 400, message: "Bad request" };
    expect(fail(error)).toStrictEqual({ outcome: "failed", error });
  });

  it("infers the error type from the argument", () => {
    type MyError = { code: number };
    expectTypeOf(fail("e")).toEqualTypeOf<RuleResult<string>>();
    expectTypeOf(fail({ code: 1 })).toEqualTypeOf<RuleResult<MyError>>();
    expectTypeOf(fail<MyError>({ code: 1 })).toEqualTypeOf<
      RuleResult<MyError>
    >();
  });
});

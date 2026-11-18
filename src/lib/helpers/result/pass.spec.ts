import { describe, expect, expectTypeOf, it } from "vitest";
import type { RuleResult } from "../../types";
import { pass } from "./pass";

describe("pass", () => {
  it("builds a passed result", () => {
    expect(pass()).toStrictEqual({ outcome: "passed" });
  });

  it("preserves the default and explicit error types", () => {
    type MyError = { code: number };
    expectTypeOf(pass()).toEqualTypeOf<RuleResult<string>>();
    expectTypeOf(pass<MyError>()).toEqualTypeOf<RuleResult<MyError>>();
  });
});

import { describe, expect, expectTypeOf, it } from "vitest";
import type { Decision, DecisionResult, Rule } from "../types";
import { defineOutcomes, type OutcomeOf } from "./define-outcomes";

interface App {
  age: number;
}
interface DomainError {
  code: string;
}
interface Ctx {
  tenant: string;
}

const credit = defineOutcomes(["declined", "review", "approved"], {
  onError: "review",
});
type CreditOutcome = "declined" | "review" | "approved";

describe("defineOutcomes types", () => {
  it("infers the outcome literals without as const", () => {
    expectTypeOf<OutcomeOf<typeof credit>>().toEqualTypeOf<CreditOutcome>();
    expectTypeOf(credit.outcomes).toEqualTypeOf<readonly CreditOutcome[]>();
    expectTypeOf(credit.onError).toEqualTypeOf<CreditOutcome>();
  });

  it("still accepts as const", () => {
    const binary = defineOutcomes(["failed", "passed"] as const, {
      onError: "failed",
    });

    expectTypeOf<OutcomeOf<typeof binary>>().toEqualTypeOf<
      "failed" | "passed"
    >();
  });

  it("rejects an onError outside the set", () => {
    expect(() =>
      defineOutcomes(["declined", "approved"], {
        // @ts-expect-error "review" is not a declared outcome
        onError: "review",
      }),
    ).toThrow(TypeError);
  });

  it("types outcome() by the set and rejects a misspelled label", () => {
    expectTypeOf(credit.outcome("approved")).toEqualTypeOf<
      DecisionResult<CreditOutcome>
    >();

    // @ts-expect-error "aproved" is misspelled
    expect(() => credit.outcome("aproved")).toThrow(TypeError);
  });

  it("gives never for OutcomeOf on anything but a toolkit", () => {
    expectTypeOf<OutcomeOf<string>>().toBeNever();
  });
});

describe("Rule as a binary Decision", () => {
  it("assigns a plain Rule to Decision<App, passed | failed>", () => {
    expectTypeOf<Rule<App>>().toExtend<Decision<App, "passed" | "failed">>();
  });

  it("assigns a Rule with a domain error", () => {
    expectTypeOf<Rule<App, DomainError>>().toExtend<
      Decision<App, "passed" | "failed">
    >();
  });

  it("assigns a Rule with a typed context to the three-parameter form", () => {
    expectTypeOf<Rule<App, DomainError, Ctx>>().toExtend<
      Decision<App, "passed" | "failed", Ctx>
    >();
  });
});

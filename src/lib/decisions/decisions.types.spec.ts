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

describe("ifElse types", () => {
  it("infers the input from a typed predicate with string branches", () => {
    const decide = credit.ifElse(
      (app: App) => app.age >= 18,
      "approved",
      "declined",
    );

    expectTypeOf(decide).toEqualTypeOf<Decision<App, CreditOutcome>>();
  });

  it("infers an inline predicate's input from the annotated result (spike)", () => {
    const decide: Decision<App, CreditOutcome> = credit.ifElse(
      (app) => {
        expectTypeOf(app).toEqualTypeOf<App>();
        return app.age > 18;
      },
      "review",
      "approved",
    );

    expect(decide).toBeTypeOf("function");
  });

  it("rejects a misspelled branch", () => {
    expect(() =>
      // @ts-expect-error "aproved" is misspelled
      credit.ifElse((app: App) => app.age >= 18, "aproved", "review"),
    ).toThrow(TypeError);
  });

  it("rejects an out-of-set onError override", () => {
    expect(() =>
      credit.ifElse((app: App) => app.age >= 18, "approved", "review", {
        // @ts-expect-error "unknown" is not a declared outcome
        onError: "unknown",
      }),
    ).toThrow(TypeError);
  });
});

describe("match types", () => {
  type Employment = "employed" | "self_employed" | "unemployed";
  interface Applicant {
    employment: Employment;
  }

  it("accepts a partial case map for a sync literal-union accessor", () => {
    const decide = credit.match(
      (applicant: Applicant) => applicant.employment,
      { employed: "approved" },
      "review",
    );

    expectTypeOf(decide).toEqualTypeOf<Decision<Applicant, CreditOutcome>>();
  });

  it("accepts a partial case map for an async literal-union accessor", () => {
    const decide = credit.match(
      async (applicant: Applicant) => applicant.employment,
      { unemployed: "declined" },
      "review",
    );

    expectTypeOf(decide).toEqualTypeOf<Decision<Applicant, CreditOutcome>>();
  });

  it("rejects a misspelled key in an inline case map (async accessor)", () => {
    credit.match(
      async (applicant: Applicant) => applicant.employment,
      {
        employed: "approved",
        // @ts-expect-error "employd" is not a key the accessor returns
        employd: "review",
      },
      "review",
    );
  });

  it("requires defaultCase", () => {
    expect(() =>
      // @ts-expect-error defaultCase is required
      credit.match((applicant: Applicant) => applicant.employment, {
        employed: "approved",
      }),
    ).toThrow(TypeError);
  });

  it("rejects a misspelled case outcome", () => {
    expect(() =>
      credit.match(
        (applicant: Applicant) => applicant.employment,
        // @ts-expect-error "aproved" is misspelled
        { employed: "aproved" },
        "review",
      ),
    ).toThrow(TypeError);
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

import { describe, expect, expectTypeOf, it } from "vitest";
import type { Decision, DecisionResult, Resolver, Rule } from "../types";
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

describe("combine types", () => {
  const approve: Decision<App, CreditOutcome> = () => ({ outcome: "approved" });

  it("infers the input and outcomes from the decisions", () => {
    const decide = credit.combine([approve, approve]);

    expectTypeOf(decide).toEqualTypeOf<Decision<App, CreditOutcome>>();
  });

  it("accepts raw Rules in a binary toolkit", () => {
    const binary = defineOutcomes(["failed", "passed"], { onError: "failed" });
    const rule: Rule<App, DomainError, Ctx> = () => ({ outcome: "passed" });

    const decide = binary.combine([rule]);

    expectTypeOf(decide).toEqualTypeOf<
      Decision<App, "failed" | "passed", Ctx>
    >();
  });

  it("rejects a raw Rule in the credit toolkit", () => {
    const rule: Rule<App> = () => ({ outcome: "passed" });

    // @ts-expect-error "passed" | "failed" are not credit outcomes
    credit.combine([rule]);
  });

  it("rejects an empty list", () => {
    expect(() =>
      // @ts-expect-error at least one decision is required
      credit.combine([]),
    ).toThrow(TypeError);
  });

  it("rejects a resolver for another outcome set or without isFinal", () => {
    const binaryResolver: Resolver<"failed" | "passed"> = {
      combine: (current) => current,
      isFinal: () => false,
    };

    expect(() =>
      credit.combine([approve], {
        // @ts-expect-error the resolver's outcomes are not credit outcomes
        resolver: binaryResolver,
      }),
    ).not.toThrow();
    expect(() =>
      credit.combine([approve], {
        // @ts-expect-error combine stops early, so it needs isFinal
        resolver: { combine: (current: CreditOutcome) => current },
      }),
    ).toThrow(TypeError);
  });
});

describe("combineAll types", () => {
  const credit = defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
  });
  const approve: Decision<App, CreditOutcome> = () => ({
    outcome: "approved",
  });

  it("returns a Decision of the toolkit's outcomes", () => {
    expectTypeOf(credit.combineAll([approve])).toEqualTypeOf<
      Decision<App, CreditOutcome, unknown>
    >();
  });

  it("accepts a combine-only resolver or a full Resolver", () => {
    const full: Resolver<CreditOutcome> = {
      combine: (current) => current,
      isFinal: () => false,
    };

    expect(() =>
      credit.combineAll([approve], {
        resolver: { combine: (current) => current },
      }),
    ).not.toThrow();
    expect(() =>
      credit.combineAll([approve], { resolver: full }),
    ).not.toThrow();
  });

  it("rejects a resolver for another outcome set", () => {
    expect(() =>
      credit.combineAll([approve], {
        resolver: {
          // @ts-expect-error the resolver's outcomes are not credit outcomes
          combine: (current: "failed" | "passed") => current,
        },
      }),
    ).not.toThrow();
  });
});

describe("mapOutcome types", () => {
  it("maps a Rule with an object error and context to the toolkit's outcomes", () => {
    const rule: Rule<App, DomainError, Ctx> = () => ({ outcome: "passed" });

    const decide = credit.mapOutcome(rule, { failed: "declined" });

    expectTypeOf(decide).toEqualTypeOf<Decision<App, CreditOutcome, Ctx>>();
  });

  it("maps a plain Rule to a two-parameter Decision", () => {
    const rule: Rule<App> = () => ({ outcome: "passed" });

    expectTypeOf(
      credit.mapOutcome(rule, { failed: "declined", passed: "review" }),
    ).toEqualTypeOf<Decision<App, CreditOutcome>>();
  });

  it("rejects out-of-set mapping labels and a credit decision as the rule", () => {
    const rule: Rule<App> = () => ({ outcome: "passed" });
    const approve: Decision<App, CreditOutcome> = () => ({
      outcome: "approved",
    });

    expect(() =>
      // @ts-expect-error "decline" is not a credit outcome
      credit.mapOutcome(rule, { failed: "decline" }),
    ).toThrow(TypeError);
    expect(() =>
      // @ts-expect-error "passed" is not a credit outcome
      credit.mapOutcome(rule, { failed: "declined", passed: "passed" }),
    ).toThrow(TypeError);
    expect(() =>
      // @ts-expect-error failed is required
      credit.mapOutcome(rule, {}),
    ).toThrow(TypeError);
    // @ts-expect-error the source must be a passed/failed decision
    credit.mapOutcome(approve, { failed: "declined" });
  });
});

describe("toolkit.resolvers types", () => {
  it("types both members as Resolver of the toolkit's labels", () => {
    expectTypeOf(credit.resolvers.strongestWins).toEqualTypeOf<
      Resolver<CreditOutcome>
    >();
    expectTypeOf(credit.resolvers.runEveryCheck).toEqualTypeOf<
      Resolver<CreditOutcome>
    >();
  });

  it("is not assignable to a toolkit with different labels", () => {
    const traffic = defineOutcomes(["stop", "go"], { onError: "stop" });
    expectTypeOf(credit.resolvers.runEveryCheck).not.toExtend<
      Resolver<OutcomeOf<typeof traffic>>
    >();
    traffic.combine([async () => traffic.outcome("go")], {
      // @ts-expect-error a resolver bound to the credit labels
      resolver: credit.resolvers.runEveryCheck,
    });
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

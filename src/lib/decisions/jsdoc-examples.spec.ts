/**
 * `tsc` does not check code inside JSDoc comments. Every public `@example`
 * of the decisions API is copied here verbatim (plus its setup), so
 * `npm run typecheck` compiles it and this file runs it. Keep both in sync by
 * copying, not paraphrasing.
 */
import { describe, expect, it } from "vitest";
import { fail, pass } from "../helpers";
import type { Decision, DecisionResult, Resolver, Rule } from "../types";
import { defineOutcomes, type OutcomeOf } from "./define-outcomes";

// Shared setup for the credit-domain examples.
interface CreditApplication {
  applicantId: string;
  monthlyIncome: number;
  monthlyDebt: number;
  employment: "employed" | "self_employed" | "unemployed";
}
const creditBureau = { score: async (_applicantId: string) => 720 };
const application: CreditApplication = {
  applicantId: "app-001",
  monthlyIncome: 6_000,
  monthlyDebt: 1_200,
  employment: "self_employed",
};

describe("JSDoc examples", () => {
  it("defineOutcomes", () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });
    type CreditOutcome = OutcomeOf<typeof credit>; // "declined" | "review" | "approved"

    const label: CreditOutcome = "review";
    expect(credit.outcomes).toContain(label);
  });

  it("OutcomeToolkit.outcome", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });
    type CreditOutcome = OutcomeOf<typeof credit>;

    const bureauScore: Decision<CreditApplication, CreditOutcome> = async (
      app,
    ) => {
      const score = await creditBureau.score(app.applicantId);
      if (score >= 700) {
        return credit.outcome("approved");
      }
      if (score >= 600) {
        return credit.outcome("review");
      }
      return credit.outcome("declined");
    };

    expect(await bureauScore(application)).toEqual({ outcome: "approved" });
  });

  it("OutcomeToolkit.ifElse", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });

    const affordability = credit.ifElse(
      (app: CreditApplication) => app.monthlyDebt / app.monthlyIncome > 0.5,
      "declined",
      "approved",
    );

    expect(await affordability(application)).toEqual({ outcome: "approved" });
  });

  it("OutcomeToolkit.match", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });

    const employment = credit.match(
      (app: CreditApplication) => app.employment,
      {
        employed: "approved",
        self_employed: "review",
        unemployed: "declined",
      },
      "review",
    );

    expect(await employment(application)).toEqual({ outcome: "review" });
  });

  it("OutcomeToolkit.combine", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });
    type CreditOutcome = OutcomeOf<typeof credit>;
    const affordability = credit.ifElse(
      (app: CreditApplication) => app.monthlyDebt / app.monthlyIncome > 0.5,
      "declined",
      "approved",
    );
    const employment = credit.match(
      (app: CreditApplication) => app.employment,
      { employed: "approved", unemployed: "declined" },
      "review",
    );
    const bureauScore: Decision<CreditApplication, CreditOutcome> = async (
      app,
    ) =>
      credit.outcome(
        (await creditBureau.score(app.applicantId)) >= 700
          ? "approved"
          : "review",
      );

    // Stops at the first "declined"; otherwise the strongest outcome wins.
    const creditPolicy = credit.combine([
      affordability,
      employment,
      bureauScore,
    ]);

    expect(await creditPolicy(application)).toEqual({ outcome: "review" });
  });

  it("OutcomeToolkit.resolvers", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });
    const affordability = credit.ifElse(
      (app: CreditApplication) => app.monthlyDebt / app.monthlyIncome > 0.5,
      "declined",
      "approved",
    );
    let employmentChecked = false;
    const employment = credit.match(
      (app: CreditApplication) => {
        employmentChecked = true;
        return app.employment;
      },
      { employed: "approved", unemployed: "declined" },
      "review",
    );

    // Every check runs in order (e.g. for an audit trail); the strongest
    // outcome still wins.
    const auditedPolicy = credit.combine([affordability, employment], {
      resolver: credit.resolvers.runEveryCheck,
    });

    const overBudget = { ...application, monthlyDebt: 4_000 };
    expect(await auditedPolicy(overBudget)).toEqual({ outcome: "declined" });
    expect(employmentChecked).toBe(true);
  });

  it("OutcomeToolkit.combineAll", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });
    type CreditOutcome = OutcomeOf<typeof credit>;
    const affordability = credit.ifElse(
      (app: CreditApplication) => app.monthlyDebt / app.monthlyIncome > 0.5,
      "declined",
      "approved",
    );
    const employment = credit.match(
      (app: CreditApplication) => app.employment,
      { employed: "approved", unemployed: "declined" },
      "review",
    );
    const bureauScore: Decision<CreditApplication, CreditOutcome> = async (
      app,
    ) =>
      credit.outcome(
        (await creditBureau.score(app.applicantId)) >= 700
          ? "approved"
          : "review",
      );

    // Runs all checks at once; the strongest outcome wins.
    const fastPolicy = credit.combineAll([
      affordability,
      employment,
      bureauScore,
    ]);

    expect(await fastPolicy(application)).toEqual({ outcome: "review" });
  });

  it("OutcomeToolkit.mapOutcome", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });
    const sanctionsService = {
      isListed: async (_applicantId: string) => false,
    };

    // A listed applicant is declined; a service outage gives onError ("review").
    const isNotSanctioned: Rule<CreditApplication> = async (app) =>
      (await sanctionsService.isListed(app.applicantId))
        ? fail("Applicant is on a sanctions list")
        : pass();
    const sanctions = credit.mapOutcome(isNotSanctioned, {
      failed: "declined",
    });

    expect(await sanctions(application)).toEqual({ outcome: "approved" });
  });

  it("Resolver", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });
    type CreditOutcome = OutcomeOf<typeof credit>;
    const affordability = credit.ifElse(
      (app: CreditApplication) => app.monthlyDebt / app.monthlyIncome > 0.5,
      "declined",
      "approved",
    );
    const employment = credit.match(
      (app: CreditApplication) => app.employment,
      { employed: "approved", unemployed: "declined" },
      "review",
    );

    // The strongest outcome wins, but every decision runs (e.g. for auditing).
    const runAll: Resolver<CreditOutcome> = {
      combine: (current, next) =>
        credit.outcomes.indexOf(next) < credit.outcomes.indexOf(current)
          ? next
          : current,
      isFinal: () => false,
    };
    const auditedPolicy = credit.combine([affordability, employment], {
      resolver: runAll,
    });

    expect(await auditedPolicy(application)).toEqual({ outcome: "review" });
  });

  it("Decision", async () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });
    type CreditOutcome = OutcomeOf<typeof credit>;

    const bureauScore: Decision<CreditApplication, CreditOutcome> = async (
      app,
    ) => {
      const score = await creditBureau.score(app.applicantId);
      return score >= 700
        ? credit.outcome("approved")
        : credit.outcome("review");
    };

    expect(await bureauScore(application)).toEqual({ outcome: "approved" });
  });

  it("DecisionResult", () => {
    const result: DecisionResult<"declined" | "approved"> = {
      outcome: "approved",
    };

    expect(result.outcome).toBe("approved");
  });
});

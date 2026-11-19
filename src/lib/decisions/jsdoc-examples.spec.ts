/**
 * `tsc` does not check code inside JSDoc comments. Every public `@example`
 * of the decisions API is copied here verbatim (plus its setup), so
 * `npm run typecheck` compiles it and this file runs it. Keep both in sync by
 * copying, not paraphrasing.
 */
import { describe, expect, it } from "vitest";
import type { Decision, DecisionResult } from "../types";
import { defineOutcomes, type OutcomeOf } from "./define-outcomes";

// Shared setup for the credit-domain examples.
interface CreditApplication {
  applicantId: string;
}
const creditBureau = { score: async (_applicantId: string) => 720 };
const application: CreditApplication = { applicantId: "app-001" };

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
      if (score >= 700) return credit.outcome("approved");
      if (score >= 600) return credit.outcome("review");
      return credit.outcome("declined");
    };

    expect(await bureauScore(application)).toEqual({ outcome: "approved" });
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

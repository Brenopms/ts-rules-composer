/**
 * The probe table from SPEC-rule-error-provenance: each rule is mapped into a
 * KYC toolkit with `{ failed: "rejected" }` (onError `manual_review`). An
 * outage gives `manual_review` plus one hook call with the original error; a
 * business failure gives `rejected` with no hook call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineOutcomes, fail, pass, pipeRules, type Rule } from "../lib";

type Applicant = { age: number };

const outage = new Error("sanctions service down");
const onErrorCaught = vi.fn<(error: unknown) => void>();

const kyc = defineOutcomes(["rejected", "manual_review", "verified"], {
  onError: "manual_review",
  onErrorCaught,
});

const isAdult: Rule<Applicant> = (applicant) =>
  applicant.age >= 18 ? pass() : fail("Applicant must be an adult");

const down: Rule<Applicant> = async () => {
  throw outage;
};

const adult: Applicant = { age: 30 };
const minor: Applicant = { age: 16 };

type Expected =
  | { readonly outcome: "manual_review"; readonly cause: unknown }
  | { readonly outcome: "rejected" | "verified" };

describe("rule-error-provenance probe table", () => {
  beforeEach(() => {
    onErrorCaught.mockClear();
  });

  it.each<[string, Rule<Applicant>, Applicant, Expected]>([
    [
      "down (raw throwing rule)",
      down,
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "pipeRules([isAdult, down])",
      pipeRules([isAdult, down]),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "pipeRules([isAdult]), applicant is 16",
      pipeRules([isAdult]),
      minor,
      { outcome: "rejected" },
    ],
  ])("%s", async (_, rule, applicant, expected) => {
    const decide = kyc.mapOutcome(rule, { failed: "rejected" });

    expect(await decide(applicant)).toStrictEqual({
      outcome: expected.outcome,
    });
    if ("cause" in expected) {
      expect(onErrorCaught).toHaveBeenCalledOnce();
      expect(onErrorCaught.mock.calls[0]?.[0]).toBe(expected.cause);
    } else {
      expect(onErrorCaught).not.toHaveBeenCalled();
    }
  });
});

/**
 * The probe table from SPEC-rule-error-provenance: each rule is mapped into a
 * KYC toolkit with `{ failed: "rejected" }` (onError `manual_review`). An
 * outage gives `manual_review` plus one hook call with the original error; a
 * business failure gives `rejected` with no hook call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  composeRules,
  defineOutcomes,
  every,
  fail,
  ifElse,
  inject,
  mapError,
  match,
  named,
  not,
  oneOf,
  pass,
  pipeRules,
  type Rule,
  type RuleResult,
  requireContextRule,
  unless,
  validateField,
  when,
  withDebug,
  withFallback,
  withLazyContext,
  withTap,
  withTimeout,
} from "../lib";

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

const passes: Rule<Applicant> = () => pass();
const predicateDown = (): boolean => {
  throw outage;
};
const denied: Rule<Applicant> = () => fail("Sanctions hit");
// Never settles, so the timer always wins (and no child timer is left behind).
const slow: Rule<Applicant> = () => new Promise<never>(() => {});
const loaderDown = (): Promise<never> => Promise.reject(outage);

const adult: Applicant = { age: 30 };
const minor: Applicant = { age: 16 };

type Expected =
  | { readonly outcome: "manual_review"; readonly cause: unknown }
  | { readonly outcome: "rejected" | "verified" };

describe("rule-error-provenance probe table", () => {
  beforeEach(() => {
    onErrorCaught.mockClear();
  });

  it.each<[string, Rule<Applicant, unknown>, Applicant, Expected]>([
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
      "not(down, e)",
      not(down, "Must not pass"),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "not(pipeRules([down]), e)",
      not(pipeRules([down]), "Must not pass"),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "not(isAdult, e), applicant is 16 (business failure still inverts)",
      not(isAdult, "Must not be an adult"),
      minor,
      { outcome: "verified" },
    ],
    [
      "mapError(down, f)",
      mapError(down, (error) => `KYC: ${error}`),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "mapError(pipeRules([down]), f)",
      mapError(pipeRules([down]), (error) => `KYC: ${error}`),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "mapError(isAdult, f), applicant is 16 (business failure)",
      mapError(isAdult, (error) => `KYC: ${error}`),
      minor,
      { outcome: "rejected" },
    ],
    [
      "every([down, passes])",
      every([down, passes]),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "every([down, denied]) (settled by denied)",
      every([down, denied]),
      adult,
      { outcome: "rejected" },
    ],
    [
      "oneOf([down, denied])",
      oneOf([down, denied]),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "oneOf([down, passes]) (settled by passes)",
      oneOf([down, passes]),
      adult,
      { outcome: "verified" },
    ],
    [
      "withFallback(down, passes) (failover kept)",
      withFallback(down, passes),
      adult,
      { outcome: "verified" },
    ],
    [
      "rule ifElse with a throwing predicate",
      ifElse(predicateDown, passes, passes),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "when with a throwing predicate",
      when(predicateDown, passes),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "unless with a throwing predicate",
      unless(predicateDown, passes),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      'withTimeout(slow, 10, "timeout") timing out',
      withTimeout(slow, 10, "timeout"),
      adult,
      { outcome: "manual_review", cause: "timeout" },
    ],
    [
      'not(withTimeout(slow, 10, "timeout"), e)',
      not(withTimeout(slow, 10, "timeout"), "Must not pass"),
      adult,
      { outcome: "manual_review", cause: "timeout" },
    ],
    [
      'withTimeout(denied, 10, "timeout"), child wins (business failure)',
      withTimeout(denied, 10, "timeout"),
      adult,
      { outcome: "rejected" },
    ],
    [
      "withLazyContext(loaderDown, passes)",
      withLazyContext(loaderDown, passes),
      adult,
      { outcome: "manual_review", cause: outage },
    ],
    [
      "not(withLazyContext(loaderDown, passes), e)",
      not(withLazyContext(loaderDown, passes), "Must not pass"),
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

describe("three-valued aggregates", () => {
  const caughtOf = async (rule: Rule<Applicant, unknown>) => {
    const result = await rule(adult);
    return result.outcome === "failed" && Object.hasOwn(result, "caughtCause")
      ? { caughtCause: result.caughtCause }
      : { outcome: result.outcome };
  };

  it("pipeRules([down, denied]) is U, every([down, denied]) is F", async () => {
    expect(await caughtOf(pipeRules([down, denied]))).toStrictEqual({
      caughtCause: outage,
    });
    expect(await caughtOf(every([down, denied]))).toStrictEqual({
      outcome: "failed",
    });
  });

  it.each<[string, Rule<Applicant, unknown>, object]>([
    [
      "not(every([down, passes]))",
      every([down, passes]),
      { caughtCause: outage },
    ],
    [
      "not(every([passes, down]))",
      every([passes, down]),
      { caughtCause: outage },
    ],
    [
      "not(every([down, denied]))",
      every([down, denied]),
      { outcome: "passed" },
    ],
    [
      "not(every([denied, down]))",
      every([denied, down]),
      { outcome: "passed" },
    ],
    [
      "not(oneOf([down, denied]))",
      oneOf([down, denied]),
      { caughtCause: outage },
    ],
    [
      "not(oneOf([denied, down]))",
      oneOf([denied, down]),
      { caughtCause: outage },
    ],
    [
      "not(oneOf([down, passes]))",
      oneOf([down, passes]),
      { outcome: "failed" },
    ],
    [
      "not(oneOf([passes, down]))",
      oneOf([passes, down]),
      { outcome: "failed" },
    ],
  ])("%s", async (_, aggregate, expected) => {
    expect(await caughtOf(not(aggregate, "Must not pass"))).toStrictEqual(
      expected,
    );
  });
});

describe("forwarders return a caught child result by identity", () => {
  const caughtResult: RuleResult = {
    outcome: "failed",
    error: "down",
    caughtCause: outage,
  };
  const caughtRule =
    <TInput>(): Rule<TInput> =>
    () =>
      caughtResult;
  const context = { userId: "u1" };

  it.each<[string, Rule<Applicant, string, typeof context>]>([
    ["pipeRules", pipeRules([caughtRule<Applicant>()])],
    ["composeRules", composeRules([caughtRule<Applicant>()])],
    ["rule match (selected case)", match(() => "a", { a: caughtRule() })],
    ["withTap", withTap<Applicant>(() => {})(caughtRule())],
    ["withDebug", withDebug(caughtRule<Applicant>(), "debugged")],
    ["inject", inject("dependency", () => caughtRule<Applicant>())],
    ["named", named("named", caughtRule<Applicant>())],
    [
      "withTimeout (child wins)",
      withTimeout(caughtRule<Applicant>(), 1000, "timeout"),
    ],
    [
      "withLazyContext",
      withLazyContext(() => context, caughtRule<Applicant>()),
    ],
    ["requireContextRule", requireContextRule("No context", caughtRule())],
    [
      "validateField",
      validateField((applicant: Applicant) => applicant.age, caughtRule()),
    ],
  ])("%s", async (_, rule) => {
    expect(await rule(adult, context)).toBe(caughtResult);
  });
});

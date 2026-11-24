/**
 * The shared contract of rule `ifElse`, `when` and `unless` when their
 * predicate fails (SPEC-rule-error-provenance): the failed predicate result
 * is returned as is, so its `caughtCause` survives, and no branch runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pass } from "../../helpers";
import type { Predicate, Rule } from "../../types";
import type { SafetyOptions } from "../../types/safety-options";
import { ifElse } from "./if-else";
import { unless } from "./unless";
import { when } from "./when";

type Build = (
  predicate: Predicate<unknown, unknown>,
  branchRule: Rule<unknown, unknown>,
  options?: SafetyOptions<unknown>,
) => Rule<unknown, unknown>;

const combinators: [string, Build][] = [
  [
    "ifElse",
    (predicate, branchRule, options) =>
      ifElse(predicate, branchRule, branchRule, options),
  ],
  [
    "when",
    (predicate, branchRule, options) => when(predicate, branchRule, options),
  ],
  [
    "unless",
    (predicate, branchRule, options) => unless(predicate, branchRule, options),
  ],
];

describe.each(combinators)(
  "rule %s with a failing predicate (caughtCause)",
  (_, combinator) => {
    const boom = new Error("predicate down");
    const throwing = () => {
      throw boom;
    };
    const branchRule = vi.fn(() => pass());
    const build = (
      predicate: Predicate<unknown, unknown>,
      options?: SafetyOptions<unknown>,
    ) => combinator(predicate, branchRule, options);
    const causeOf = (result: object) =>
      (result as { caughtCause?: unknown }).caughtCause;

    beforeEach(() => {
      branchRule.mockClear();
    });

    it("returns the caught predicate failure with its cause, runs no rule", async () => {
      const result = await build(throwing)("input");

      expect(result).toStrictEqual({
        outcome: "failed",
        error: boom,
        caughtCause: boom,
      });
      expect(causeOf(result)).toBe(boom);
      expect(branchRule).not.toHaveBeenCalled();
    });

    it("keeps the cause with the predicateErrorTransform payload", async () => {
      const result = await build(throwing, {
        predicateErrorTransform: () => "mapped",
      })("input");

      expect(result).toStrictEqual({
        outcome: "failed",
        error: "mapped",
        caughtCause: boom,
      });
    });

    it("keeps an own undefined cause from `throw undefined`", async () => {
      const result = await build(() => {
        throw undefined;
      })("input");

      expect(Object.hasOwn(result, "caughtCause")).toBe(true);
      expect(causeOf(result)).toBeUndefined();
    });

    it("marks a non-boolean predicate with the diagnostic Error", async () => {
      const result = await build(() => "yes" as unknown as boolean)("input");

      expect(causeOf(result)).toStrictEqual(
        new Error("Predicate must return boolean, got string"),
      );
    });

    it("still marks in unsafe mode (predicates are always safe)", async () => {
      const result = await build(throwing, { errorHandlingMode: "unsafe" })(
        "input",
      );

      expect(causeOf(result)).toBe(boom);
    });
  },
);

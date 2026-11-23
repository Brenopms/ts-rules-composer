/**
 * Internal (not re-exported): builds and recognizes failures the library
 * caught, as opposed to business failures built with `fail()`.
 */
import type { RuleResult } from "../../types";
import { fail } from "./fail";

/** The failed arm of a rule result. */
export type Failed<E> = Extract<RuleResult<E>, { outcome: "failed" }>;

/**
 * A failed result carrying the caught value as `caughtCause`. The return type
 * is the failed arm only, so it fits `RuleResult<E>` and `PredicateResult<E>`.
 */
export const caughtFailure = <E>(error: E, cause: unknown) =>
  ({ outcome: "failed", error, caughtCause: cause }) as const;

/**
 * Whether a result is a caught failure: an own `outcome` of `"failed"` and an
 * own `caughtCause`, whatever its value (`throw undefined` is still caught).
 */
export const isCaught = (result: object): boolean =>
  Object.hasOwn(result, "outcome") &&
  (result as { outcome: unknown }).outcome === "failed" &&
  Object.hasOwn(result, "caughtCause");

/** Whether a rule result failed (caught or not). */
export const isFailed = <E>(result: RuleResult<E>): result is Failed<E> =>
  result.outcome === "failed";

/**
 * The failure of an aggregate (`every`, `oneOf`) from its collected payloads
 * (declaration order). Caught (unknown) with `marked`'s cause when given,
 * else a plain `fail` (a confirmed no).
 */
export const collectedFailure = <E>(
  errors: E[],
  marked: Failed<E> | undefined,
): RuleResult<E[]> =>
  marked === undefined
    ? fail(errors)
    : caughtFailure(errors, marked.caughtCause);

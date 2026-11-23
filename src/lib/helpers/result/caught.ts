/**
 * Internal (not re-exported): builds and recognizes failures the library
 * caught, as opposed to business failures built with `fail()`.
 */

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

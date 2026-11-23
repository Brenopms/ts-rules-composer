/**
 * Represents the result of a predicate evaluation.
 * @template TError - The type of the error (defaults to string)
 * @example
 * // Passed result, true value
 * const passed: PredicateResult = { outcome: "passed", value: true };
 *
 * // Passed result, false value
 * const passed: PredicateResult = { outcome: "passed", value: false };
 *
 *
 * // Failed result
 * const failed: PredicateResult = {
 *   outcome: "failed",
 *   error: "Validation failed"
 * };
 */
export type PredicateResult<TError = string> =
  | { readonly outcome: "passed"; value: boolean }
  | {
      readonly outcome: "failed";
      readonly error: TError;
      /**
       * The original error when this failure was caught rather than decided:
       * the value a rule threw or rejected with, or the `Error` built for a
       * malformed result. Set only by the library's catch points (such as
       * `withSafeError`); `fail()` never sets it. A result with its own
       * `outcome: "failed"` and its own `caughtCause`, whatever the value (even
       * `undefined`), counts as caught. The name is reserved: don't set it by
       * hand.
       */
      readonly caughtCause?: unknown;
    };

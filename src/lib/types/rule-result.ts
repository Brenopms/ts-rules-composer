/**
 * Represents the result of a rule evaluation.
 * @template TError - The type of the error (defaults to string)
 * @example
 * // Passed result
 * const passed: RuleResult = { outcome: "passed" };
 *
 * // Failed result
 * const failed: RuleResult = {
 *   outcome: "failed",
 *   error: "Validation failed"
 * };
 */
export type RuleResult<TError = string> =
  | { readonly outcome: "passed" }
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

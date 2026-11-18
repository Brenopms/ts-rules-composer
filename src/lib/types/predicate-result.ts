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
  | { readonly outcome: "failed"; readonly error: TError };

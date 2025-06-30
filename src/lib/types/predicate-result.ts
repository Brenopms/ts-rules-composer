/**
 * Represents the result of a predicate evaluation.
 * @template TError - The type of the error (defaults to string)
 * @example
 * // Passed result, true value
 * const passed: PredicateResult = { status: "passed", value: true };
 *
 * // Passed result, false value
 * const passed: PredicateResult = { status: "passed", value: false };
 *
 *
 * // Failed result
 * const failed: PredicateResult = {
 *   status: "failed",
 *   error: "Validation failed"
 * };
 */
export type PredicateResult<TError = string> =
  | { readonly status: "passed"; value: boolean }
  | { readonly status: "failed"; readonly error: TError };

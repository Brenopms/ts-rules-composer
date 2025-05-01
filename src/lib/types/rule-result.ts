/**
 * Represents the result of a rule evaluation.
 * @template TError - The type of the error (defaults to string)
 * @example
 * // Passed result
 * const passed: RuleResult = { status: "passed" };
 *
 * // Failed result
 * const failed: RuleResult = {
 *   status: "failed",
 *   error: "Validation failed"
 * };
 */
export type RuleResult<TError = string> =
  | { readonly status: "passed" }
  | { readonly status: "failed"; readonly error: TError };

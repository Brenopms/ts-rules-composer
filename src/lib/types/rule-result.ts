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
  | { readonly outcome: "failed"; readonly error: TError };

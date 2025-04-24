/**
 * The result of a rule evaluation
 */
export type RuleResult<TError = string> =
  | { readonly status: "passed" }
  | { readonly status: "failed"; readonly error: TError };

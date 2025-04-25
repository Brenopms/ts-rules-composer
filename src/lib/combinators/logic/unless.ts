import type { Rule } from "../../types";
import { pass } from "../../helpers";

/**
 * Runs a rule only when the predicate is FALSE (inverse of `when`)
 * @param predicate Condition to check
 * @param rule Rule to run when predicate returns false
 * @returns New rule that skips when predicate passes
 */
export const unless = <TInput, TError = string, TContext = unknown>(
  predicate: (input: TInput) => Promise<boolean> | boolean,
  rule: Rule<TInput, TError, TContext>,
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) =>
    await predicate(input) ? pass() : rule(input, context);
};

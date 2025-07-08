import { fail, getNormalizedRule } from "../../helpers";
import { pass } from "../../helpers/result/pass";
import type { Predicate, RuleSafetyOptions } from "../../types";
import type { Rule } from "../../types/rule";
import { withSafePredicate } from "../utility";

/**
 * Conditionally executes a rule based on a predicate.
 * Similar to branch but without an else case.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @param predicate - Function that determines whether to execute the rule
 * @param rule - Rule to execute when predicate returns true
 * @returns A new rule that conditionally executes the input rule
 * @example
 * const rule = when(
 *   (user) => user.role === "admin",
 *   validateAdminPrivileges
 * );
 * @caveats
 * - The predicate can be async
 * - If predicate returns false, the rule automatically passes
 */
export const when = <TInput, TError = string, TContext = unknown>(
  predicate: Predicate<TInput, TContext>,
  rule: Rule<TInput, TError, TContext>,
  options?: RuleSafetyOptions<TError>,
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const normalizedRule = getNormalizedRule(rule, options);
    const safePredicate = withSafePredicate<TInput, TError, TContext>(
      predicate,
    );

    const safePredicateResult = await safePredicate(input, context);
    if (safePredicateResult.status === "failed") {
      return fail(safePredicateResult.error);
    }

    return safePredicateResult.value ? normalizedRule(input, context) : pass();
  };
};

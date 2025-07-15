import { fail, getNormalizedRule } from "../../helpers";
import { pass } from "../../helpers/result/pass";
import type { Predicate } from "../../types";
import type { Rule } from "../../types/rule";
import type { SafetyOptions } from "../../types/safety-options";
import { withSafePredicate } from "../utility";

/**
 * Conditionally executes a rule based on a predicate.
 * Similar to branch but without an else case.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @param predicate - Function that determines whether to execute the rule
 * @param rule - Rule to execute when predicate returns true
 * @param options - Configuration for error handling and predicate safety
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @param options.predicateErrorTransform - Special error handler for predicate failures
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
  options?: SafetyOptions<TError>,
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const normalizedRule = getNormalizedRule(rule, options);
    const safePredicate = withSafePredicate<TInput, TError, TContext>(
      predicate,
      options?.predicateErrorTransform,
    );

    const safePredicateResult = await safePredicate(input, context);
    if (safePredicateResult.status === "failed") {
      return fail(safePredicateResult.error);
    }

    return safePredicateResult.value ? normalizedRule(input, context) : pass();
  };
};

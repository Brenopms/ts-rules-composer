import { fail, getNormalizedRule, pass } from "../../helpers";
import type { Predicate, Rule } from "../../types";
import type { SafetyOptions } from "../../types/safety-options";
import { withSafePredicate } from "../utility";

/**
 * Executes a rule only if the predicate returns false.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param predicate - Condition to check
 * @param rule - Rule to execute when predicate is false
 * @param options - Configuration for error handling and predicate safety
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @param options.predicateErrorTransform - Special error handler for predicate failures
 * @returns A rule that conditionally executes based on the predicate
 * @example
 * const rule = unless(
 *   (user) => user.isVerified,
 *   requireVerification
 * );
 * @caveats
 * - Opposite behavior of `when`
 * - Automatically passes when predicate is true
 */
export const unless = <TInput, TError = string, TContext = unknown>(
  predicate: Predicate<TInput, TContext>,
  rule: Rule<TInput, TError, TContext>,
  options?: SafetyOptions<TError>,
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const normalizedRule = getNormalizedRule(rule, options);
    const safePredicate = withSafePredicate<TInput, TError, TContext>(
      predicate,
      options?.predicateErrorTransform
    );

    const safePredicateResult = await safePredicate(input, context);

    // Predicate fail to run or returned invalid result
    if (safePredicateResult.status === "failed") {
      return fail(safePredicateResult.error);
    }

    return safePredicateResult.value ? pass() : normalizedRule(input, context);
  };
};

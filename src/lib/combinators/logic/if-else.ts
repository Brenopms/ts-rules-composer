import { fail, getNormalizedRules, pass } from "../../helpers";
import type { Predicate, Rule } from "../../types";
import type { SafetyOptions } from "../../types/safety-options";
import { withSafePredicate } from "../utility";

/**
 * Conditionally executes one of two rules based on a predicate
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param predicate - Function that determines which rule to execute
 * @param ifRule - Rule to execute when predicate returns true
 * @param elseRule - Rule to execute when predicate returns false (optional)
 * @param options - Configuration for error handling and predicate safety
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @param options.predicateErrorTransform - Special error handler for predicate failures
 * @returns A new rule that conditionally executes one of two rules
 * @example
 * const rule = ifElse(
 *   (user) => user.age >= 18,
 *   validateAdultAccount,
 *   validateMinorAccount
 * );
 *
 * // Without elseRule (passes when predicate is false)
 * const adultOnlyRule = ifElse(
 *   (user) => user.age >= 18,
 *   validateAdultAccount
 * );
 */
export const ifElse = <TInput, TError = string, TContext = unknown>(
  predicate: Predicate<TInput, TContext>,
  ifRule: Rule<TInput, TError, TContext>,
  elseRule?: Rule<TInput, TError, TContext>,
  options?: SafetyOptions<TError>,
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const safePredicate = withSafePredicate<TInput, TError, TContext>(
      predicate,
      options?.predicateErrorTransform,
    );
    const safePredicateResult = await safePredicate(input, context);

    // Predicate fail to run or returned invalid result
    if (safePredicateResult.status === "failed") {
      return fail(safePredicateResult.error);
    }

    const [normalizedIfRule, normalizedElseRule] = getNormalizedRules(
      [ifRule, elseRule!],
      options,
    );

    const shouldBranch = safePredicateResult.value;
    return shouldBranch
      ? normalizedIfRule(input, context)
      : elseRule
        ? normalizedElseRule(input, context)
        : pass();
  };
};

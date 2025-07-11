import { getNormalizedRule } from "../../helpers";
import type { Rule, RuleResult, RuleSafetyOptions } from "../../types";

/**
 * Creates a rule wrapper that performs side effects without modifying the result.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param effect - Side effect function receiving input, result and context
 * @param options - Configuration for error handling safety
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @returns A function that wraps a rule with the tap effect
 * @example
 * const withLogging = tap((input, result) => {
 *   console.log(`Validation result for ${input}:`, result);
 * });
 *
 * const rule = withLogging(validateInput);
 * @caveats
 * - Errors in the effect are caught and logged but don't affect rule execution
 * - Doesn't modify the rule's result
 */
export const withTap = <TInput, TError = string, TContext = unknown>(
  effect: (
    input: TInput,
    result: RuleResult<TError>,
    context?: TContext,
  ) => Promise<void> | void,
  options?: RuleSafetyOptions<TError>,
): ((
  rule: Rule<TInput, TError, TContext>,
) => Rule<TInput, TError, TContext>) => {
  return (rule) => async (input, context) => {
    const safeRule = getNormalizedRule(rule, options);
    const result = await safeRule(input, context);
    try {
      await effect(input, result, context);
    } catch (error) {
      console.error("Tap effect failed:", error);
    }
    return result;
  };
};

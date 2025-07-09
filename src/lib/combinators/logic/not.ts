import { pass, fail, getNormalizedRule } from "../../helpers";
import type { RuleSafetyOptions } from "../../types";
import type { Rule } from "../../types/rule";

/**
 * Inverts the logic of a rule - passes when original fails and vice versa.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @param rule - The rule to invert
 * @param error - The error to return when original rule passes
 * @param options - Configuration for error handling safety
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @returns A new rule with inverted logic
 * @example
 * const isNotAdmin = not(isAdmin, "User must not be admin");
 * @caveats
 * - The original rule's error is discarded when it fails
 * - Always uses the provided error when original passes
 */
export const not = <TInput, TError = string>(
  rule: Rule<TInput, TError>,
  error: TError,
  options?: RuleSafetyOptions<TError>,
): Rule<TInput, TError> => {
  return async (input: TInput, context?: unknown) => {
    const normalizedRule = getNormalizedRule(rule, options);

    const result = await normalizedRule(input, context);
    return result.status === "passed" ? fail(error) : pass();
  };
};

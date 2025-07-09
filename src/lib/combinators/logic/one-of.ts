import { fail, getNormalizedRules, pass } from "../../helpers";
import type { Rule, RuleSafetyOptions } from "../../types";

/**
 * Creates a rule that passes if any of the provided rules pass (short-circuiting).
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rules - Rules to try (in order)
 * @param options - Configuration for error handling
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @returns A rule that passes if any rule passes, or fails with all errors
 * @example
 * const rule = oneOf(
 *   validateEmail,
 *   validatePhone,
 *   validateUsername
 * );
 * @caveats
 * - Rules are executed in sequence until one passes
 * - Returns all errors if all rules fail
 */
export const oneOf = <TInput, TError = string, TContext = unknown>(
  rules: Rule<TInput, TError, TContext>[],
  options?: RuleSafetyOptions<TError>,
): Rule<TInput, TError[], TContext> => {
  return async (input: TInput, context?: TContext) => {
    const normalizedRules = getNormalizedRules(rules, options);
    const errors: TError[] = [];

    if (!rules || rules.length === 0) {
      return pass();
    }

    for (const rule of normalizedRules) {
      const result = await rule(input, context);
      if (result.status === "passed") {
        return pass();
      }
      errors.push(result.error);
    }

    return fail(errors);
  };
};

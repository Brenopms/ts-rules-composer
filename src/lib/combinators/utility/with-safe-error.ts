import { fail } from "../../helpers";
import type { Rule, RuleResult } from "../../types";

/**
 * Wraps a rule to catch errors and convert them to failed RuleResults
 * @template TInput - The input type
 * @template TError - The error type (defaults to string)
 * @template TContext - The context type
 * @param rule - The rule to protect
 * @param errorMapper - Optional error transformation logic
 * @returns A protected version of the rule
 * @example
 * // Basic usage with default error handling
 * const safeRule = withSafeError(riskyRule);
 *
 * // With custom error transformation
 * const customSafeRule = withSafeError(riskyRule, e => ({
 *   code: 500,
 *   message: String(e)
 * }));
 *
 * @caveats
 *
 * - Generic parameters must be explicitly set for custom error types
 * - Doesn't verify error types match TError at runtime
 */
export const withSafeError = <TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  errorTransform: (error: unknown) => TError = (e) => {
    // Preserve object structure if TError is object-like
    if (typeof e === "object" && e !== null) return e as TError;
    // Default to string for primitives/errors
    return (e instanceof Error ? e.message : String(e)) as TError;
  },
): Rule<TInput, TError, TContext> => {
  return async (
    input: TInput,
    context?: TContext,
  ): Promise<RuleResult<TError>> => {
    try {
      const result = await rule(input, context);

      // Preserve existing RuleResults
      if (result && typeof result === "object" && "status" in result) {
        return result;
      }

      // Handle invalid rule implementations that don't return RuleResult
      return fail(
        errorTransform(new Error(`Invalid rule - did not return RuleResult`)),
      );
    } catch (error) {
      return fail(errorTransform(error));
    }
  };
};

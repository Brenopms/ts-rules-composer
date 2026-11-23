import { caughtFailure } from "../../helpers/result/caught";
import type { Rule, RuleResult } from "../../types";

const INVALID_RESULT_MESSAGE = "Invalid rule - did not return RuleResult";
const LEGACY_RESULT_MESSAGE =
  "Invalid rule - returned a 1.x result ({ status }); 2.0 results use { outcome }";

/**
 * Wraps a rule to catch errors and convert them to failed RuleResults.
 * A caught failure carries the original error as `caughtCause`: the thrown or
 * rejected value, or the `Error` built for a malformed or 1.x-shaped result.
 * The rule's own results, including its failures, are returned unchanged.
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
  // The diagnostic Error is the cause; a transform throwing here is caught
  // below like any other throw.
  const markInvalid = (message: string): RuleResult<TError> => {
    const error = new Error(message);
    return caughtFailure(errorTransform(error), error);
  };

  return async (
    input: TInput,
    context?: TContext,
  ): Promise<RuleResult<TError>> => {
    try {
      const result = await rule(input, context);

      if (result && typeof result === "object") {
        // Preserve valid RuleResults
        if (
          result.outcome === "passed" ||
          (result.outcome === "failed" && "error" in result)
        ) {
          return result;
        }
        // Explain results still shaped like 1.x ({ status })
        if (!("outcome" in result) && "status" in result) {
          return markInvalid(LEGACY_RESULT_MESSAGE);
        }
      }

      // Handle invalid rule implementations that don't return RuleResult
      return markInvalid(INVALID_RESULT_MESSAGE);
    } catch (error) {
      return caughtFailure(errorTransform(error), error);
    }
  };
};

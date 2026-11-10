import { fail, pass } from "../../helpers";
import type { Rule } from "../../types";

/**
 * Transforms the error of a rule using a mapping function.
 * @template TInput - The type of the input to validate
 * @template TError - The original error type
 * @template TNewError - The new error type
 * @template TContext - The type of the context object (optional, defaults to unknown)
 * @param rule - The rule whose errors should be transformed
 * @param transform - Function to transform the error
 * @returns A new rule that produces transformed errors
 * @example
 * const rule = mapError(
 *   validateEmail,
 *   (error) => `Validation failed: ${error}`
 * );
 *
 * // Can also change error types:
 * const numericErrorRule = mapError(
 *   stringErrorRule,
 *   (error) => error.length // Convert string error to number
 * );
 * @caveats
 * - The context type of the wrapped rule is preserved and forwarded to it
 * - Only transforms failed results, passes successful results through unchanged
 * - The transform function is not called for successful results
 */
export const mapError = <TInput, TError, TNewError, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  transform: (error: TError) => TNewError,
): Rule<TInput, TNewError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const result = await rule(input, context);
    return result.status === "failed" ? fail(transform(result.error)) : pass();
  };
};

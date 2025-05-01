import { fail, pass } from "../../helpers";
import { Rule } from "../../types";

/**
 * Transforms the error of a rule using a mapping function.
 * @template TInput - The type of the input to validate
 * @template TError - The original error type
 * @template TNewError - The new error type
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
 * - Only transforms failed results, passes successful results through unchanged
 * - The transform function is not called for successful results
 */
export const mapError = <TInput, TError, TNewError>(
  rule: Rule<TInput, TError>,
  transform: (error: TError) => TNewError,
): Rule<TInput, TNewError> => {
  return async (input: TInput, context?: unknown) => {
    const result = await rule(input, context);
    return result.status === "failed" ? fail(transform(result.error)) : pass();
  };
};

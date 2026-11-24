import { attachNode } from "../../graph/node";
import { fail, pass } from "../../helpers";
import { caughtFailure, isCaught } from "../../helpers/result/caught";
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
 * - A caught failure (one carrying `caughtCause`) keeps its cause by identity;
 *   only its `error` payload is transformed
 */
export const mapError = <TInput, TError, TNewError, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  transform: (error: TError) => TNewError,
): Rule<TInput, TNewError, TContext> => {
  return attachNode<Rule<TInput, TNewError, TContext>>(
    async (input: TInput, context?: TContext) => {
      const result = await rule(input, context);
      if (result.outcome !== "failed") return pass();
      if (!isCaught(result)) return fail(transform(result.error));
      // A caught failure stays unknown: only its payload is mapped. The cause
      // is read before the transform runs, so the transform can't swap it.
      const cause = result.caughtCause;
      return caughtFailure(transform(result.error), cause);
    },
    {
      kind: "decorator",
      decorator: "mapError",
      rule,
      params: {},
    },
  );
};

import type { Rule } from "../../types";
import { fail } from "../result";

/**
 * Creates a rule that loads context lazily before execution.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error
 * @template TContext - The type of the context object
 * @param loader - Function to load context from input
 * @param rule - Rule that requires the context
 * @returns A rule that loads context before execution
 * @example
 * const rule = withLazyContext(
 *   async (userId) => await loadUserContext(userId),
 *   validateUser
 * );
 * @caveats
 * - Context loading failures are converted to validation failures
 * - The loader is called for every rule execution
 */
export const withLazyContext = <TInput, TError, TContext>(
  loader: (input: TInput) => Promise<TContext> | TContext,
  rule: Rule<TInput, TError, TContext>,
): Rule<TInput, TError> => {
  return async (input: TInput) => {
    try {
      const context = await loader(input);
      return rule(input, context);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Context loading failed";
      return fail(errorMessage as TError);
    }
  };
};

import { pass } from "../helpers";
import { CompositionOptions, Rule } from "../types";

/**
 * Pipes multiple rules into a single rule that runs them sequentially (fail-fast).
 * Stops at the first failure and returns the error.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rules - Array of rules to compose
 * @param options - Configuration options
 * @param options.cloneContext - Whether to clone the context for each rule (default: false)
 * @returns A new rule that pipes all input rules
 * @example
 * const rule = pipeRules([
 *   validateString,
 *   validateLength,
 *   validateFormat
 * ]);
 *
 * const result = await rule("test@example.com");
 * @caveats
 * - Rules are execute from left to right
 * - Rules are executed in sequence, not in parallel
 * - Context clone uses structuredClone Nodejs implementation
 */
export const pipeRules = <TInput, TError = string, TContext = unknown>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions = {},
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const currentContext = options?.cloneContext
      ? structuredClone(context)
      : context;

    for (const rule of rules) {
      const result = await rule(input, currentContext);
      if (result.status === "failed") {
        return result;
      }
    }
    return pass();
  };
};

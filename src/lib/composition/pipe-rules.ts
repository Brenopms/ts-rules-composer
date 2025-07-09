import { getNormalizedRules, pass } from "../helpers";
import { getCloneFn } from "../helpers/clone/getCloneFn";
import type { CompositionOptions, Rule } from "../types";

/**
 * Pipes multiple rules into a single rule that runs them sequentially (fail-fast).
 * Stops at the first failure and returns the error.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rules - Array of rules to compose
 * @param options - Configuration options
 * @param options.cloneContext - Whether to clone the context for each rule (default: false)
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
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
 * - Cloning behavior follows this priority:
 *   1. Uses shallowClone if options.shallowClone = true
 *   2. Uses structuredClone if available and options.structuredClone = true
 *   3. Falls back to JSON clone otherwise
 */
export const pipeRules = <TInput, TError = string, TContext = unknown>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions = {},
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const cloneFn = getCloneFn(options);
    const currentContext = options?.cloneContext ? cloneFn(context) : context;
    const normalizedRules = getNormalizedRules(rules);

    for (const rule of normalizedRules) {
      const result = await rule(input, currentContext);
      if (result.status === "failed") {
        return result;
      }
    }
    return pass();
  };
};

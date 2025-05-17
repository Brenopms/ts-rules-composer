import { pass } from "../helpers";
import { getCloneFn } from "../helpers/clone/getCloneFn";
import type { CompositionOptions, Rule } from "../types";

/**
 * Composes multiple rules into a single rule that runs them in right-to-left order (fail-fast).
 * Stops at the first failure and returns the error.
 *
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rules - Array of rules to compose
 * @param options - Configuration options
 * @param options.cloneContext - Whether to clone the context for each rule (default: false)
 * @returns A new rule that composes all input rules
 *
 * @example
 * const rule = composeRules([
 *   finalCheck,
 *   normalizeInput,
 *   validateBase
 * ]);
 *
 * const result = await rule(input);
 *
 * @caveats
 * - Rules are executed from **right to left**
 * - Rules are executed sequentially (not in parallel)
 * - Cloning behavior follows this priority:
 *   1. Uses shallowClone if options.shallowClone = true
 *   2. Uses structuredClone if available and options.structuredClone = true
 *   3. Falls back to JSON clone otherwise
 */
export const composeRules = <TInput, TError = string, TContext = unknown>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions = {},
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const cloneFn = getCloneFn(options);
    const currentContext = options?.cloneContext ? cloneFn(context) : context;

    for (let i = rules.length - 1; i >= 0; i--) {
      const result = await rules[i](input, currentContext);
      if (result.status === "failed") {
        return result;
      }
    }
    return pass();
  };
};

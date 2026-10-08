import type { CompositionOptions, Rule } from "../types";

import { prepareRuleExecution } from "./rule-execution";

/**
 * Composes multiple rules into a single rule that runs them in right-to-left order (fail-fast).
 * Stops at the first failure and returns the error.
 *
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rules - Array of rules to compose
 * @param options - Configuration options
 * @param options.cloneContext - Whether to clone the context once per composed invocation (default: false)
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
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
  options: CompositionOptions<TError> = {},
): Rule<TInput, TError, TContext> => {
  return prepareRuleExecution(rules, options, "reverseFailFast");
};

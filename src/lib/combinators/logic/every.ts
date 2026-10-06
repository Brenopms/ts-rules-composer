import { prepareRuleExecution } from "../../composition/rule-execution";
import type { CompositionOptions, Rule } from "../../types";

/**
 * Composes multiple rules into a single rule that runs them all and collects all errors.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rules - Array of rules to compose
 * @param options - Configuration options
 * @param options.cloneContext - Whether to clone the context once per composed invocation (default: false)
 * @param options.cloneStrategy -Which strategy to use when cloning the context
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @returns A new rule that returns all errors from all failing rules
 * @example
 * const rule = every([
 *   validatePresence,
 *   validateEmail,
 *   validateUnique
 * ]);
 *
 * const result = await rule("invalid-email");
 * if (result.status === "failed") {
 *   console.log(result.error); // Array of all errors
 * }
 * @caveats
 * - Rules are executed in parallel (using Promise.all)
 * - All rules are executed even if some fail
 * - Cloning behavior follows this priority:
 *   1. Uses shallowClone if options.shallowClone = true
 *   2. Uses structuredClone if available and options.structuredClone = true
 *   3. Falls back to JSON clone otherwise
 */
export const every = <TInput, TError = string, TContext = unknown>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions<TError> = {},
): Rule<TInput, TError[], TContext> => {
  return prepareRuleExecution(rules, options, "parallelCollect");
};

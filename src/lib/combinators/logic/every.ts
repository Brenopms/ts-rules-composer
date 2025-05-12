import { fail, pass } from "../../helpers";
import { CompositionOptions, Rule } from "../../types";

/**
 * Composes multiple rules into a single rule that runs them all and collects all errors.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rules - Array of rules to compose
 * @param options - Configuration options
 * @param options.cloneContext - Whether to clone the context for each rule (default: false)
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
 */
export const every = <TInput, TError = string, TContext = unknown>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions = {},
): Rule<TInput, TError[], TContext> => {
  return async (input: TInput, context?: TContext) => {
    const currentContext = options?.cloneContext
      ? structuredClone(context)
      : context;

    const results = await Promise.all(
      rules.map((rule) => rule(input, currentContext)),
    );

    const errors = results.flatMap((r) =>
      r.status === "failed" ? [r.error] : [],
    );

    return errors.length > 0 ? fail(errors) : pass();
  };
};

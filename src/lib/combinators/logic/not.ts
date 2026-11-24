import { attachNode } from "../../graph/node";
import { fail, getNormalizedRule, pass } from "../../helpers";
import { isCaught } from "../../helpers/result/caught";
import type { RuleSafetyOptions } from "../../types";
import type { Rule } from "../../types/rule";

/**
 * Inverts the logic of a rule. A passing child produces `fail(error)`. An
 * unmarked failure produces `pass()`. A caught failure (one with a
 * `caughtCause`, such as a throw caught by the default safe mode) is returned
 * as the same object, preserving its `error` and `caughtCause`.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional, defaults to unknown)
 * @param rule - The rule to invert
 * @param error - The error to return when original rule passes
 * @param options - Configuration for error handling safety
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @returns A new rule with inverted logic
 * @example
 * const isNotAdmin = not(isAdmin, "User must not be admin");
 * @caveats
 * - The default safety transform can preserve a thrown `Error` even when
 *   `TError` is `string`. To control the payload of a caught failure, supply
 *   `errorTransform` at the point that catches the exception. A failure
 *   already returned by the child keeps its original payload.
 */
export const not = <TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  error: TError,
  options?: RuleSafetyOptions<TError>,
): Rule<TInput, TError, TContext> => {
  return attachNode<Rule<TInput, TError, TContext>>(
    async (input: TInput, context?: TContext) => {
      const normalizedRule = getNormalizedRule(rule, options);

      const result = await normalizedRule(input, context);
      if (result.outcome === "passed") {
        return fail(error);
      }
      // An unknown stays unknown: a caught failure is not a "no".
      return isCaught(result) ? result : pass();
    },
    { kind: "not", rule },
  );
};

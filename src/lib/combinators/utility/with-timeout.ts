import { fail } from "../../helpers";
import { Rule, RuleResult } from "../../types";

/**
 * Wraps a rule with timeout functionality.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error
 * @template TContext - The type of the context object
 * @param rule - The rule to wrap with timeout
 * @param timeoutMs - Timeout duration in milliseconds
 * @param timeoutError - Error to return if timeout occurs
 * @returns A new rule that fails with timeoutError if execution takes longer than timeoutMs
 * @example
 * const rule = withTimeout(
 *   slowNetworkRequestRule,
 *   5000, // 5 seconds
 *   "Request timed out"
 * );
 * @caveats
 * - The original rule's execution isn't aborted when timeout occurs
 * - Only fails if the rule doesn't complete before timeout, not if it fails before timeout
 */
export const withTimeout = <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
  timeoutMs: number,
  timeoutError: TError,
): Rule<TInput, TError, TContext> => {
  return async (input, context) => {
    const timeout = new Promise<RuleResult<TError>>((resolve) =>
      setTimeout(() => resolve(fail(timeoutError)), timeoutMs),
    );
    return Promise.race([rule(input, context), timeout]);
  };
};

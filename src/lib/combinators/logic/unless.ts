import { pass } from "../../helpers";
import type { Rule } from "../../types";

/**
 * Executes a rule only if the predicate returns false.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param predicate - Condition to check
 * @param rule - Rule to execute when predicate is false
 * @returns A rule that conditionally executes based on the predicate
 * @example
 * const rule = unless(
 *   (user) => user.isVerified,
 *   requireVerification
 * );
 * @caveats
 * - Opposite behavior of `when`
 * - Automatically passes when predicate is true
 */
export const unless = <TInput, TError = string, TContext = unknown>(
  predicate: (input: TInput) => Promise<boolean> | boolean,
  rule: Rule<TInput, TError, TContext>,
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) =>
    (await predicate(input)) ? pass() : rule(input, context);
};

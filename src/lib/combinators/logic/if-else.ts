import { pass } from "../../helpers";
import { Rule } from "../../types";

/**
 * Conditionally executes one of two rules based on a predicate
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param predicate - Function that determines which rule to execute
 * @param ifRule - Rule to execute when predicate returns true
 * @param elseRule - Rule to execute when predicate returns false (optional)
 * @returns A new rule that conditionally executes one of two rules
 * @example
 * const rule = branch(
 *   (user) => user.age >= 18,
 *   validateAdultAccount,
 *   validateMinorAccount
 * );
 *
 * // Without elseRule (passes when predicate is false)
 * const adultOnlyRule = branch(
 *   (user) => user.age >= 18,
 *   validateAdultAccount
 * );
 */
export const ifElse = <TInput, TError = string, TContext = unknown>(
  predicate: (input: TInput, context?: TContext) => boolean | Promise<boolean>,
  ifRule: Rule<TInput, TError, TContext>,
  elseRule?: Rule<TInput, TError, TContext>,
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const shouldBranch = await predicate(input, context);
    return shouldBranch
      ? ifRule(input, context)
      : elseRule
        ? elseRule(input, context)
        : pass();
  };
};

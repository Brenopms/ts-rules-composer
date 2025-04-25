import { pass } from "../../helpers";
import { Rule } from "../../types";

/**
 * Conditionally branches between two rules based on a predicate
 * @param predicate Function that determines which rule to execute
 * @param ifRule Rule to execute when predicate returns true
 * @param elseRule Rule to execute when predicate returns false (optional)
 */
export const branch = <TInput, TError = string, TContext = unknown>(
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

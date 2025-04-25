import { Rule } from "../types/rule";
import { RuleResult } from "../types/rule-result";

export const tap = <TInput, TError = string, TContext = unknown>(
  effect: (
    input: TInput,
    result: RuleResult<TError>,
    context?: TContext,
  ) => Promise<void> | void,
): ((
  rule: Rule<TInput, TError, TContext>,
) => Rule<TInput, TError, TContext>) => {
  return (rule) => async (input, context) => {
    const result = await rule(input, context);
    try {
      await effect(input, result, context);
    } catch (error) {
      console.error("Tap effect failed:", error);
    }
    return result;
  };
};

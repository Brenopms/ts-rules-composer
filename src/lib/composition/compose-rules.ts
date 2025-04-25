import { pass } from "../helpers/pass";
import { CompositionOptions } from "../types/composition-options";
import { Rule } from "../types/rule";

/**
 * Composes rules sequentially (fail-fast)
 */
export const composeRules = <TInput, TError = string, TContext = unknown>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions = {},
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const currentContext = options?.cloneContext
      ? structuredClone(context)
      : context;

    for (const rule of rules) {
      const result = await rule(input, currentContext);
      if (result.status === "failed") {
        return result;
      }
    }
    return pass();
  };
};

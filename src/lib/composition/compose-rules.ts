import { pass } from '../helpers';
import { CompositionOptions, Rule } from "../types";

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

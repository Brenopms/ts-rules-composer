import { fail } from "../helpers/fail";
import { pass } from "../helpers/pass";
import { CompositionOptions } from "../types/composition-options";
import { Rule } from "../types/rule";

/**
 * Composes rules sequentially (fail-fast)
 */
export const composeRules = <TInput, TError = string>(
  rules: Rule<TInput, TError>[],
  options: CompositionOptions = {},
): Rule<TInput, TError> => {
  return async (input: TInput, context?: unknown) => {
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

/**
 * Composes rules in parallel (collect all errors)
 */
export const allRules = <TInput, TError = string>(
  rules: Rule<TInput, TError>[],
  options: CompositionOptions = {},
): Rule<TInput, TError[]> => {
  return async (input: TInput, context?: unknown) => {
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

import { fail, pass } from "../../helpers";
import { Rule } from "../../types";

/**
 * Succeeds if any of the provided rules pass (OR logic)
 * @param rules Array of rules to try
 * @returns Rule that passes if any rule passes, or collects all errors
 */
export const oneOf = <TInput, TError = string, TContext = unknown>(
  ...rules: Rule<TInput, TError, TContext>[]
): Rule<TInput, TError[], TContext> => {
  return async (input: TInput, context?: TContext) => {
    const errors: TError[] = [];

    if (!rules || rules.length === 0) {
      return pass();
    }

    for (const rule of rules) {
      const result = await rule(input, context);
      if (result.status === "passed") {
        return pass();
      }
      errors.push(result.error);
    }

    return fail(errors);
  };
};

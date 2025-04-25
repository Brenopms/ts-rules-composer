import { fail, pass } from "../../helpers";
import { CompositionOptions, Rule } from "../../types";


export const allRules = <TInput, TError = string, TContext = unknown>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions = {},
): Rule<TInput, TError[], TContext> => {
  return async (input: TInput, context?: TContext) => {
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

import { fail } from "../helpers/fail";
import { pass } from "../helpers/pass";
import { CompositionOptions } from "../types/composition-options";
import { Rule } from "../types/rule";


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

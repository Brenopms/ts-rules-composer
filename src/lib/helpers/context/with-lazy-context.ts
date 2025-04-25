import { Rule } from "../../types/rule";
import { fail } from "../result/fail";

export const withLazyContext = <TInput, TError, TContext>(
  loader: (input: TInput) => Promise<TContext> | TContext,
  rule: Rule<TInput, TError, TContext>,
): Rule<TInput, TError> => {
  return async (input: TInput) => {
    try {
      const context = await loader(input);
      return rule(input, context);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Context loading failed";
      return fail(errorMessage as TError);
    }
  };
};

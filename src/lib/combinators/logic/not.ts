import { pass, fail } from "../../helpers";
import { Rule } from "../../types/rule";

export const not = <TInput, TError = string>(
  rule: Rule<TInput, TError>,
  error: TError,
): Rule<TInput, TError> => {
  return async (input: TInput, context?: unknown) => {
    const result = await rule(input, context);
    return result.status === "passed" ? fail(error) : pass();
  };
};

import { fail, pass } from "../../helpers";
import { Rule } from "../../types";

export const mapError = <TInput, TError, TNewError>(
  rule: Rule<TInput, TError>,
  transform: (error: TError) => TNewError,
): Rule<TInput, TNewError> => {
  return async (input: TInput, context?: unknown) => {
    const result = await rule(input, context);
    return result.status === "failed" ? fail(transform(result.error)) : pass();
  };
};

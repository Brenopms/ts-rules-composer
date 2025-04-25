import { fail } from "../../helpers/result/fail";
import { pass } from '../../helpers/result/pass';
import { Rule } from "../../types/rule";

export const mapError = <TInput, TError, TNewError>(
  rule: Rule<TInput, TError>,
  transform: (error: TError) => TNewError,
): Rule<TInput, TNewError> => {
  return async (input: TInput, context?: unknown) => {
    const result = await rule(input, context);
    return result.status === "failed" ? fail(transform(result.error)) : pass();
  };
};

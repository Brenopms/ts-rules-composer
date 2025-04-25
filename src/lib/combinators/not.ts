import { fail } from "../helpers/fail";
import { pass } from "../helpers/pass";
import { Rule } from "../types/rule";

export const not = <TInput, TError = string>(
  rule: Rule<TInput, TError>,
  error: TError,
): Rule<TInput, TError> => {
  return async (input: TInput, context?: unknown) => {
    const result = await rule(input, context);
    return result.status === "passed" ? fail(error) : pass();
  };
};
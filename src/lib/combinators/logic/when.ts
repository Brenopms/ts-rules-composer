import { pass } from "../../helpers/result/pass";
import { Rule } from "../../types/rule";

export const when = <TInput, TError = string>(
  predicate: (input: TInput) => boolean | Promise<boolean>,
  rule: Rule<TInput, TError>,
): Rule<TInput, TError> => {
  return async (input: TInput, context?: unknown) => {
    const shouldRun = await predicate(input);
    return shouldRun ? rule(input, context) : pass();
  };
};

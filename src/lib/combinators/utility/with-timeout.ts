import { fail } from "../../helpers";
import { Rule, RuleResult } from "../../types";

export const withTimeout = <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
  timeoutMs: number,
  timeoutError: TError,
): Rule<TInput, TError, TContext> => {
  return async (input, context) => {
    const timeout = new Promise<RuleResult<TError>>((resolve) =>
      setTimeout(() => resolve(fail(timeoutError)), timeoutMs),
    );
    return Promise.race([rule(input, context), timeout]);
  };
};

import { Rule } from "../types/rule";
import { RuleResult } from "../types/rule-result";
import { fail } from "./fail";

export const requireContextRule = <
  TInput,
  TError,
  TContext,
  TRequiredContext extends TContext,
>(
  error: TError,
  rule: (
    input: TInput,
    context: TRequiredContext,
  ) => Promise<RuleResult<TError>> | RuleResult<TError>,
  contextCheck?: (context: TContext | undefined) => context is TRequiredContext,
): Rule<TInput, TError, TContext> => {
  const defaultCheck = (ctx: TContext | undefined): ctx is TRequiredContext => {
    return ctx !== undefined;
  };

  const check = contextCheck || defaultCheck;

  return async (input: TInput, context?: TContext) => {
    return check(context) ? rule(input, context) : fail(error);
  };
};

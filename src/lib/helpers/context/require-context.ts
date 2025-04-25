import { Rule } from "../../types/rule";
import { RuleResult } from "../../types/rule-result";
import { fail } from "../result/fail";

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

/**
 * const userRule = requireContextRule(
  "User context required",
  (input: string, ctx: { userId: string }) => {
    return ctx.userId === "admin" 
      ? pass() 
      : fail("Unauthorized");
  }
);

await userRule("action"); // fails with "User context required"
await userRule("action", { userId: "user" }); // fails with "Unauthorized"
await userRule("action", { userId: "admin" }); // passes
 */

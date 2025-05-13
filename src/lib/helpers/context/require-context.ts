import type { Rule, RuleResult } from "../../types";
import { fail } from "../result";

/**
 * Creates a rule that requires specific context to be present.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error
 * @template TContext - The base context type
 * @template TRequiredContext - The required context type
 * @param error - Error to return if context is invalid
 * @param rule - Rule that requires the specific context
 * @param contextCheck - Optional type guard for context validation
 * @returns A rule that validates context before execution
 * @example
 * const adminRule = requireContextRule(
 *   "Admin context required",
 *   (input, context: AdminContext) => { ... },
 *   (ctx): ctx is AdminContext => ctx?.role === "admin"
 * );
 * @caveats
 * - Fails immediately if context check fails
 * - Provides type safety for context requirements
 */
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

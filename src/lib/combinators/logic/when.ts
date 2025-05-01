import { pass } from "../../helpers/result/pass";
import { Rule } from "../../types/rule";

/**
 * Conditionally executes a rule based on a predicate.
 * Similar to branch but without an else case.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @param predicate - Function that determines whether to execute the rule
 * @param rule - Rule to execute when predicate returns true
 * @returns A new rule that conditionally executes the input rule
 * @example
 * const rule = when(
 *   (user) => user.role === "admin",
 *   validateAdminPrivileges
 * );
 * @caveats
 * - The predicate can be async
 * - If predicate returns false, the rule automatically passes
 */
export const when = <TInput, TError = string>(
  predicate: (input: TInput) => boolean | Promise<boolean>,
  rule: Rule<TInput, TError>,
): Rule<TInput, TError> => {
  return async (input: TInput, context?: unknown) => {
    const shouldRun = await predicate(input);
    return shouldRun ? rule(input, context) : pass();
  };
};

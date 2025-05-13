import { pass, fail } from "../../helpers";
import type { Rule } from "../../types/rule";

/**
 * Inverts the logic of a rule - passes when original fails and vice versa.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @param rule - The rule to invert
 * @param error - The error to return when original rule passes
 * @returns A new rule with inverted logic
 * @example
 * const isNotAdmin = not(isAdmin, "User must not be admin");
 * @caveats
 * - The original rule's error is discarded when it fails
 * - Always uses the provided error when original passes
 */
export const not = <TInput, TError = string>(
  rule: Rule<TInput, TError>,
  error: TError,
): Rule<TInput, TError> => {
  return async (input: TInput, context?: unknown) => {
    const result = await rule(input, context);
    return result.status === "passed" ? fail(error) : pass();
  };
};

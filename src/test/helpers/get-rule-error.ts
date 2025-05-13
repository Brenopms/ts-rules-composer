import type { RuleResult } from "../../lib/types";

/**
 * Extracts the error from a failed RuleResult.
 * @template TError - The type of the error
 * @param result - The RuleResult to inspect
 * @returns The error from a failed result
 * @throws {Error} When called on a passed result
 * @example
 * const result = await validate(input);
 * if (result.status === "failed") {
 *   const error = getError(result);
 *   // Handle error
 * }
 * @caveats
 * - Throws an error if called on a passed result
 */
export const getRuleError = <TError>(result: RuleResult<TError>): TError => {
  if (result.status !== "failed") {
    throw new Error("Cannot get error from passed result");
  }
  return result.error;
};

import { RuleResult } from "../../types";

/**
 * Creates a failed RuleResult with the provided error.
 * @template TError - The type of the error (defaults to string)
 * @param error - The error to include in the failed result
 * @returns A RuleResult with status "failed" and the provided error
 * @example
 * const result = fail("Invalid input"); // { status: "failed", error: "Invalid input" }
 *
 * // Used in rule implementations:
 * const alwaysFails: Rule<string> = () => fail("Always fails");
 */
export const fail = <TError = string>(error: TError): RuleResult<TError> =>
  ({ status: "failed", error }) as const;

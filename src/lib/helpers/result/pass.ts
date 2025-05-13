import type { RuleResult } from "../../types";

/**
 * Creates a successful RuleResult with "passed" status.
 * @template TError - The type of the error (defaults to string)
 * @returns A RuleResult with status "passed"
 * @example
 * const result = pass(); // { status: "passed" }
 *
 * // Used in rule implementations:
 * const alwaysPasses: Rule<string> = () => pass();
 */
export const pass = <TError = string>(): RuleResult<TError> =>
  ({ status: "passed" }) as const;

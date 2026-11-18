import type { RuleResult } from "../../types";

/**
 * Creates a successful RuleResult with outcome "passed".
 * @template TError - The type of the error (defaults to string)
 * @returns A RuleResult with outcome "passed"
 * @example
 * const result = pass(); // { outcome: "passed" }
 *
 * // Used in rule implementations:
 * const alwaysPasses: Rule<string> = () => pass();
 */
export const pass = <TError = string>(): RuleResult<TError> =>
  ({ outcome: "passed" }) as const;

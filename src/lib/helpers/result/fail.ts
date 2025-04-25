import { RuleResult } from "../../types";

/**
 * Helper to create failure results
 */
export const fail = <TError = string>(error: TError): RuleResult<TError> =>
  ({ status: "failed", error } as const);

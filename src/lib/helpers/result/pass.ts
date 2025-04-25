import { RuleResult } from '../../types/rule-result';

/**
 * Helper to create success results
 */
export const pass = <TError = string>(): RuleResult<TError> =>
  ({ status: "passed" } as const);

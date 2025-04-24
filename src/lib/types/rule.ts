import { RuleResult } from './rule-result';

/**
 * A rule that validates an input of type TInput
 */
export type Rule<TInput, TError = string> = (
  input: TInput,
  context?: unknown
) => Promise<RuleResult<TError>> | RuleResult<TError>;

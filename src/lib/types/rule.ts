import { RuleResult } from './rule-result';

/**
 * A rule that validates an input of type TInput
 */
export type Rule<TInput, TError = string, TContext = unknown> = (
  input: TInput,
  context?: TContext
) => Promise<RuleResult<TError>> | RuleResult<TError>;
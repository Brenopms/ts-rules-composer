import { RuleResult } from './rule-result';

export type DebugOptions<TInput, TError, TContext> = {
  /** Unique identifier for the rule */
  name?: string;
  /** Called before rule execution */
  onStart?: (input: TInput, context?: TContext) => void;
  /** Called after rule completes */
  onEnd?: (
    input: TInput,
    result: RuleResult<TError>,
    context?: TContext,
    meta?: {
      ruleName: string;
      duration: number;
      startTime: number;
    },
  ) => void;
  /** Called when rule throws */
  onError?: (
    error: unknown,
    input: TInput,
    context?: TContext,
    duration?: number,
  ) => void;
};
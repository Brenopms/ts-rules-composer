import { RuleResult } from './rule-result';



/**
 * Configuration options for debug functionality.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error
 * @template TContext - The type of the context object
 * @property name - Unique identifier for the rule
 * @property onStart - Called before rule execution
 * @property onEnd - Called after rule completes
 * @property onError - Called when rule throws
 */
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
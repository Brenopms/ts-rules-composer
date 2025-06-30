import type { PredicateResult } from "./predicate-result";

/**
 * A predicate function that evaluates an input and returns a PredicateResult.
 * Can be synchronous or asynchronous.
 */
export type PredicateSafe<TInput, TError, TContext> = (
  input: TInput,
  context?: TContext,
) => PredicateResult<TError> | Promise<PredicateResult<TError>>;

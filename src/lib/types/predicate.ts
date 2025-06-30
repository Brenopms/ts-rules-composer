/**
 * A predicate function that evaluates an input and returns a boolean result.
 * Can be synchronous or asynchronous.
 */
export type Predicate<TInput, TContext> = (
  input: TInput,
  context?: TContext,
) => boolean | Promise<boolean>;

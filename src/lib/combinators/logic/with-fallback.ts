import type { Rule } from "../../types";

/**
 * Creates a rule that falls back to an alternative rule if the main rule fails.
 * @template TInput - Input type
 * @template TError - Error type
 * @template TContext - Context type
 * @param mainRule - Primary rule to execute first
 * @param fallbackRule - Rule to execute if main rule fails
 * @param options - Configuration options
 * @param options.onlyFallbackOn - Predicate to conditionally enable fallback
 * @returns A new composite rule
 * @example
 * const rule = withFallback(
 *   premiumValidation,
 *   basicValidation,
 *   { onlyFallbackOn: err => err.code !== 'FATAL' }
 * );
 */
export const withFallback = <TInput, TError, TContext>(
  mainRule: Rule<TInput, TError, TContext>,
  fallbackRule: Rule<TInput, TError, TContext>,
  options: {
    onlyFallbackOn?: (error: TError) => boolean;
  } = {},
): Rule<TInput, TError, TContext> => {
  return async (input: TInput, context?: TContext) => {
    const result = await mainRule(input, context);
    if (
      result.status === "failed" &&
      (!options.onlyFallbackOn || options.onlyFallbackOn(result.error))
    ) {
      return fallbackRule(input, context);
    }
    return result;
  };
};

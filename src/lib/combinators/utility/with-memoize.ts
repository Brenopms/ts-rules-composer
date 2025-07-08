import { getNormalizedRule } from "../../helpers";
import type { Rule, RuleResult, RuleSafetyOptions } from "../../types";

/**
 * Creates a memoized version of a rule that caches results based on input keys.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rule - The rule to memoize
 * @param keyFn - Function that generates a cache key from the input
 * @param options - Memoization options
 * @param options.ttl - Time-to-live for cache entries in milliseconds
 * @param options.maxSize - Maximum number of entries to keep in cache
 * @returns A memoized version of the rule
 * @example
 * const memoizedRule = withMemoize(
 *   expensiveValidationRule,
 *   (input) => input.id,
 *   { ttl: 60000, maxSize: 100 }
 * );
 * @caveats
 * - Context changes don't invalidate cache by default
 * - Cache cleanup happens during rule execution
 * - Rejected promises are automatically evicted from cache
 * - Successful results obey TTL rules
 * - Cache is shared across rule instances
 */
export const withMemoize = <TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  keyFn: (input: TInput) => string,
  options: {
    ttl?: number; // Milliseconds
    maxSize?: number;
  } & RuleSafetyOptions<TError> = {},
): Rule<TInput, TError, TContext> => {
  const cache = new Map<
    string,
    {
      result: Promise<RuleResult<TError>> | RuleResult<TError>;
      timestamp: number;
    }
  >();

  return async (input: TInput, context?: TContext) => {
    const key = keyFn(input);
    const now = Date.now();

    // Cache cleanup
    if (options.ttl) {
      for (const [key, entry] of cache) {
        if (now - entry.timestamp > options.ttl) {
          cache.delete(key);
        }
      }
    }

    // Size management
    if (options.maxSize && cache.size >= options.maxSize) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }

    // Cache hit
    if (cache.has(key)) {
      return cache.get(key)!.result;
    }

    // Cache miss
    const normalizedRule = getNormalizedRule(rule, options);
    const result = normalizedRule(input, context);
    cache.set(key, {
      result,
      timestamp: now,
    });

    // Handle Promise cleanup if rejected
    if (result instanceof Promise) {
      result.catch(() => cache.delete(key));
    }

    return result;
  };
};

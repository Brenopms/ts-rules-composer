import { getNormalizedRule } from "../../helpers";
import type { Rule, RuleResult, RuleSafetyOptions } from "../../types";

/**
 * Creates a memoized version of a rule that caches results based on input keys.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rule - The rule to memoize
 * @param keyFn - Function that generates a cache key from the input
 * @param options - Memoization and safety options
 * @param options.ttl - Time-to-live for cache entries in milliseconds
 * @param options.maxSize - Maximum number of entries to keep in cache
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
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
 * - Each call to withMemoize creates its own cache; it is not shared across memoized rules
 * - Entries are evicted oldest-inserted first (FIFO) once maxSize is reached; hits do not refresh recency
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

    // Cache hit
    const cached = cache.get(key);
    if (cached) {
      return cached.result;
    }

    // Size management (FIFO): only a miss adds an entry, so only a miss evicts
    if (options.maxSize && cache.size >= options.maxSize) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
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

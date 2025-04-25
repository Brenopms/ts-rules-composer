import { Rule, RuleResult } from "../../types";


// Context changes don't invalidate cache by default
export const memoizeRule = <TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  keyFn: (input: TInput) => string,
  options: {
    ttl?: number; // Milliseconds
    maxSize?: number;
  } = {},
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
    const result = rule(input, context);
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

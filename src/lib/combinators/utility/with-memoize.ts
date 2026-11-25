import { attachNode } from "../../graph/node";
import { getNormalizedRule } from "../../helpers";
import { isCaught } from "../../helpers/result/caught";
import type { Rule, RuleResult, RuleSafetyOptions } from "../../types";

type CacheEntry<TError> = {
  readonly result: Promise<RuleResult<TError>> | RuleResult<TError>;
  readonly timestamp: number;
};

// An unsafe rule may return anything; only an object can be a caught failure.
const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null;

// A result that throws when inspected is kept, as before, rather than letting
// the throw escape the detached settlement handler as an unhandled rejection.
const isCaughtResult = (value: unknown): boolean => {
  try {
    return isObject(value) && isCaught(value);
  } catch {
    return false;
  }
};

/**
 * Creates a memoized version of a rule that caches results based on input keys.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rule - The rule to memoize
 * @param keyFn - Function that generates a cache key from the input and, optionally,
 *   the context. Include every piece of context the verdict depends on (user,
 *   tenant, permissions); otherwise one caller can be served another caller's result
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
 *
 * // verdict depends on who is asking: key by context too
 * const perUser = withMemoize(
 *   permissionRule,
 *   (input, context) => JSON.stringify([context?.userId, input.id])
 * );
 * @caveats
 * - The cache key is exactly what `keyFn` returns: a key that ignores context
 *   shares entries across contexts, so a result cached for one user can be served
 *   to another. Key by context whenever the result depends on it
 * - Build keys unambiguously: joining values with a separator (`${a}:${b}`) can make
 *   different callers produce the same key; serialize them (`JSON.stringify([a, b])`)
 * - Cache cleanup happens during rule execution
 * - Rejected promises and caught failures (results carrying `caughtCause`, i.e.
 *   outages) are evicted once they settle, so the next call recomputes; callers
 *   already waiting still get them. Business failures are cached like passes
 * - Successful results obey TTL rules
 * - Each call to withMemoize creates its own cache; it is not shared across memoized rules
 * - Entries are evicted oldest-inserted first (FIFO) once maxSize is reached; hits do not refresh recency
 */
export const withMemoize = <TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  keyFn: (input: TInput, context?: TContext) => string,
  options: {
    ttl?: number; // Milliseconds
    maxSize?: number;
  } & RuleSafetyOptions<TError> = {},
): Rule<TInput, TError, TContext> => {
  const cache = new Map<string, CacheEntry<TError>>();

  // TTL or maxSize may have replaced this call's entry (possibly with the same
  // promise, in unsafe mode), so only remove the entry object it stored.
  const evict = (key: string, entry: CacheEntry<TError>) => {
    if (cache.get(key) === entry) {
      cache.delete(key);
    }
  };

  const removeExpired = (now: number) => {
    const { ttl } = options;
    if (ttl) {
      for (const [key, entry] of cache) {
        if (now - entry.timestamp > ttl) {
          cache.delete(key);
        }
      }
    }
  };

  // FIFO: only a miss adds an entry, so only a miss evicts.
  const makeRoom = () => {
    if (options.maxSize && cache.size >= options.maxSize) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
  };

  const evictOnOutage = (key: string, entry: CacheEntry<TError>) => {
    const { result } = entry;
    if (result instanceof Promise) {
      result.then(
        (settled) => {
          if (isCaughtResult(settled)) {
            evict(key, entry);
          }
        },
        () => evict(key, entry),
      );
    } else if (isCaughtResult(result)) {
      evict(key, entry);
    }
  };

  return attachNode<Rule<TInput, TError, TContext>>(
    async (input: TInput, context?: TContext) => {
      const key = keyFn(input, context);
      const now = Date.now();

      removeExpired(now);

      const cached = cache.get(key);
      if (cached) {
        return cached.result;
      }

      makeRoom();
      const normalizedRule = getNormalizedRule(rule, options);
      const entry = { result: normalizedRule(input, context), timestamp: now };
      cache.set(key, entry);
      evictOnOutage(key, entry);

      return entry.result;
    },
    {
      kind: "decorator",
      decorator: "memoize",
      rule,
      params: {},
    },
  );
};

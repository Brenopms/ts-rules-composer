import { calculateDelay, fail } from "../../helpers";
import type { Rule } from "../../types";

export type RetryOn = "failed" | "thrown" | "both";

export type RetryStrategy =
  | "fixed"
  | "linear"
  | "exponential"
  | ((attempt: number) => number);

/**
 * Wraps a rule with retry logic for handling transient failures.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param rule - The rule to wrap with retry logic
 * @param options - Retry configuration
 * @param options.attempts - Maximum number of attempts (default: 3)
 * @param options.delayMs - Delay between attempts in milliseconds (default: 100)
 * @param options.shouldRetry - Function to determine if a failure should be retried
 * @param options.retryOn - What to retry: "failed" results, "thrown" exceptions, or "both" (default)
 * @returns A new rule with retry capability
 * @example
 * const rule = withRetry(apiCheckRule, {
 *   attempts: 5,
 *   delayMs: 500,
 *   shouldRetry: (error) => error.statusCode === 503
 * });
 * @caveats
 * - Retries both failed RuleResults and thrown exceptions by default
 * - A failed result is a deliberate decision, not a transient fault: do not retry
 *   policy decisions. Use `retryOn: "thrown"` for guardrails and other rules
 *   where a "no" must stay a "no"
 * - A failure excluded by `retryOn` is returned immediately (a thrown exception
 *   becomes a failed result carrying the thrown value)
 * - `retryOn` and `shouldRetry` compose: an attempt is retried only if both allow it
 * - The final error will be "MAX_RETRIES_EXCEEDED" if all attempts fail
 */
export const withRetry = <TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  options: {
    attempts?: number;
    delayMs?: number;
    retryStrategy?: RetryStrategy;
    shouldRetry?: (error: TError | unknown, attempt: number) => boolean;
    retryOn?: RetryOn;
  } = {},
): Rule<TInput, TError | "MAX_RETRIES_EXCEEDED", TContext> => {
  const {
    attempts = 3,
    delayMs = 100,
    shouldRetry = () => true,
    retryOn = "both",
  } = options;

  return async (input, context) => {
    let lastError: TError | unknown;
    let wasThrown: boolean;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = await rule(input, context);
        if (result.status === "passed") {
          return result;
        }
        lastError = result.error;
        wasThrown = false;
      } catch (error) {
        lastError = error;
        wasThrown = true;
      }

      const kindAllowed =
        retryOn === "both" || retryOn === (wasThrown ? "thrown" : "failed");

      // Check if we should retry the last error
      if (!kindAllowed || !shouldRetry(lastError as TError, attempt)) {
        return fail(lastError as TError);
      }

      // Delay if not the last attempt
      if (attempt < attempts && delayMs > 0) {
        const delay = calculateDelay(options?.retryStrategy, attempt, delayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return fail("MAX_RETRIES_EXCEEDED" as const);
  };
};

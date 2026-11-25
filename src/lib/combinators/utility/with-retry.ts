import { attachNode, jsonNumber } from "../../graph/node";
import { calculateDelay, fail } from "../../helpers";
import { caughtFailure, isCaught } from "../../helpers/result/caught";
import type { Rule, RuleResult } from "../../types";

export type RetryOn = "failed" | "thrown" | "both";

export type RetryStrategy =
  | "fixed"
  | "linear"
  | "exponential"
  | ((attempt: number) => number);

type WithRetryOptions<TError> = {
  attempts?: number;
  delayMs?: number;
  retryStrategy?: RetryStrategy;
  shouldRetry?: (error: TError | unknown, attempt: number) => boolean;
  retryOn?: RetryOn;
};

/**
 * A failed attempt: its kind for `retryOn`, its payload, and the reason
 * `shouldRetry` sees (for a `"thrown"` attempt, also the terminal cause).
 */
type FailedAttempt = {
  readonly kind: "failed" | "thrown";
  readonly error: unknown;
  readonly reason: unknown;
};

type Attempt<TError> =
  | { readonly kind: "passed"; readonly result: RuleResult<TError> }
  | FailedAttempt;

const thrownAttempt = (error: unknown): FailedAttempt => ({
  kind: "thrown",
  error,
  reason: error,
});

// A caught failure is an outage, so it counts as thrown, with its cause as reason.
const toAttempt = <TError>(result: RuleResult<TError>): Attempt<TError> => {
  if (result.outcome === "passed") {
    return { kind: "passed", result };
  }
  if (isCaught(result)) {
    return { kind: "thrown", error: result.error, reason: result.caughtCause };
  }
  // Read once, so shouldRetry and the payload see the same value.
  const error = result.error;
  return { kind: "failed", error, reason: error };
};

const runAttempt = async <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
  input: TInput,
  context: TContext | undefined,
): Promise<Attempt<TError>> => {
  try {
    return toAttempt(await rule(input, context));
  } catch (error) {
    return thrownAttempt(error);
  }
};

/** The terminal failure: caught iff the attempt was thrown, with its reason as cause. */
const failureOf = <E>(attempt: FailedAttempt, payload: E): RuleResult<E> =>
  attempt.kind === "thrown"
    ? caughtFailure(payload, attempt.reason)
    : fail(payload);

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
 * @param options.onExhausted - What to return when every attempt fails:
 *   "max-retries" (default) returns "MAX_RETRIES_EXCEEDED"; "last-error"
 *   returns the final error unchanged and keeps the error type as `TError`
 * @returns A new rule with retry capability
 * @example
 * const rule = withRetry(apiCheckRule, {
 *   attempts: 5,
 *   delayMs: 500,
 *   shouldRetry: (error) => error.statusCode === 503,
 *   onExhausted: "last-error"
 * });
 * @caveats
 * - Retries both failed RuleResults and thrown exceptions by default
 * - A business failure (`fail(...)`) is a deliberate decision, not a transient
 *   fault: do not retry policy decisions. Use `retryOn: "thrown"` for guardrails
 *   and other rules where a "no" must stay a "no"
 * - `"thrown"` covers exceptions and caught failures (results carrying
 *   `caughtCause`, i.e. outages); `shouldRetry` then receives the thrown value
 *   or the `caughtCause`. Business failures are `"failed"` and pass their `error`
 * - A failure excluded by `retryOn` is returned immediately (a thrown exception
 *   becomes a caught failure carrying the thrown value)
 * - `retryOn` and `shouldRetry` compose: an attempt is retried only if both allow it
 * - By default the final error is "MAX_RETRIES_EXCEEDED" if all attempts fail,
 *   which hides why the rule failed; use `onExhausted: "last-error"` to keep it
 * - With "last-error" the final error may be a thrown value, as with `shouldRetry`
 * - The final failure keeps the last attempt's `caughtCause` when that attempt
 *   was thrown or caught
 */
export function withRetry<TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  options: WithRetryOptions<TError> & { onExhausted: "last-error" },
): Rule<TInput, TError, TContext>;
export function withRetry<TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  options?: WithRetryOptions<TError> & { onExhausted?: "max-retries" },
): Rule<TInput, TError | "MAX_RETRIES_EXCEEDED", TContext>;
export function withRetry<TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  options?: WithRetryOptions<TError> & {
    onExhausted?: "max-retries" | "last-error";
  },
): Rule<TInput, TError | "MAX_RETRIES_EXCEEDED", TContext>;
export function withRetry<TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  options: WithRetryOptions<TError> & {
    onExhausted?: "max-retries" | "last-error";
  } = {},
): Rule<TInput, TError | "MAX_RETRIES_EXCEEDED", TContext> {
  const {
    attempts = 3,
    delayMs = 100,
    shouldRetry = () => true,
    retryOn = "both",
    onExhausted = "max-retries",
  } = options;

  type Result = RuleResult<TError | "MAX_RETRIES_EXCEEDED">;

  const isRetryAllowed = (failed: FailedAttempt, attempt: number) =>
    (retryOn === "both" || retryOn === failed.kind) &&
    shouldRetry(failed.reason as TError, attempt);

  const waitBeforeRetry = async (attempt: number) => {
    if (attempt < attempts && delayMs > 0) {
      const delay = calculateDelay(options?.retryStrategy, attempt, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };

  // No attempt ran (attempts < 1): an unmarked failure, as before.
  const exhausted = (last: FailedAttempt | undefined): Result => {
    const payload =
      onExhausted === "last-error"
        ? (last?.error as TError)
        : ("MAX_RETRIES_EXCEEDED" as const);
    return last === undefined ? fail(payload) : failureOf(last, payload);
  };

  return attachNode<Rule<TInput, TError | "MAX_RETRIES_EXCEEDED", TContext>>(
    async (input, context): Promise<Result> => {
      let last: FailedAttempt | undefined;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        const tried = await runAttempt(rule, input, context);
        if (tried.kind === "passed") {
          return tried.result;
        }
        last = tried;
        if (!isRetryAllowed(tried, attempt)) {
          return failureOf(tried, tried.error as TError);
        }
        await waitBeforeRetry(attempt);
      }

      return exhausted(last);
    },
    {
      kind: "decorator",
      decorator: "retry",
      rule,
      params: { attempts: jsonNumber(attempts), retryOn },
    },
  );
}

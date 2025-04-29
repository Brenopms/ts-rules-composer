import type { Rule } from "../../types";
import { fail } from "../../helpers";

export const withRetry = <TInput, TError = string, TContext = unknown>(
  rule: Rule<TInput, TError, TContext>,
  options: {
    attempts?: number;
    delayMs?: number;
    shouldRetry?: (error: TError | unknown, attempt: number) => boolean;
  } = {},
): Rule<TInput, TError | "MAX_RETRIES_EXCEEDED", TContext> => {
  const { attempts = 3, delayMs = 100, shouldRetry = () => true } = options;

  return async (input, context) => {
    let lastError: TError | unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = await rule(input, context);
        if (result.status === "passed") return result;
        lastError = result.error;
      } catch (error) {
        lastError = error;
      }

      // Check if we should retry the last error
      if (!shouldRetry(lastError as TError, attempt)) {
        return fail(lastError as TError);
      }

      // Delay if not the last attempt
      if (attempt < attempts && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return fail("MAX_RETRIES_EXCEEDED" as const);
  };
};
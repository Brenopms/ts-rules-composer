import type { RetryStrategy } from "../../combinators";

export const calculateDelay = (
  strategy: RetryStrategy | undefined,
  attempt: number,
  initialDelayMs: number,
): number => {
  const strategies: Record<string, (attempt: number) => number> = {
    fixed: () => initialDelayMs,
    linear: (attempt) => initialDelayMs * attempt,
    exponential: (attempt) => initialDelayMs * 2 ** (attempt - 1),
  };

  if (!strategy) {
    return strategies["fixed"](attempt);
  }

  // If strategy is one of the predefined strings, use the corresponding function.
  if (typeof strategy === "string") {
    const strategyFn = strategies[strategy];
    return strategyFn ? strategyFn(attempt) : initialDelayMs;
  }

  // If the strategy is a custom function, call it.
  if (typeof strategy === "function") {
    return strategy(attempt);
  }

  // If it doesn't match any cases, uses fixed strategy by default
  return strategies["fixed"](attempt);
};

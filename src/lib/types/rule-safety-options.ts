/**
 * Configuration options for error handling behavior in rule combinators
 * @template TError - The type of the error that will be caught and transformed (when safe)
 *
 * @property errorHandling - Determines how the combinator handles thrown errors
 *   - "safe": (default) Catches errors and converts them to failed RuleResults
 *   - "unsafe": Lets errors propagate normally (for performance-critical cases)
 *
 * @property errorTransform - Optional custom error transformation function
 *   Only used when errorHandling="safe". Allows customizing how thrown errors
 *   are converted to the rule's error type.
 *
 * @example
 * // Basic usage with default safe handling
 * const rule = every([rule1, rule2], { errorHandling: "safe" });
 *
 * @example
 * // Unsafe mode for performance
 * const rule = every([rule1, rule2], { errorHandling: "unsafe" });
 *
 * @example
 * // Custom error transformation
 * const rule = every([rule1, rule2], {
 *   errorHandling: "safe",
 *   errorTransform: (err) => ({
 *     code: 500,
 *     message: String(err)
 *   })
 * });
 */
export type RuleSafetyOptions<TError = unknown> = {
  errorHandlingMode?: "safe" | "unsafe";
  errorTransform?: (error: unknown) => TError;
};

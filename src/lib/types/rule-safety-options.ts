/**
 * Configuration options for error handling behavior in rule combinators
 * @template TError - The type of the error that will be caught and transformed (when safe)
 *
 * @property errorHandlingMode - Determines how the combinator handles thrown errors
 *   - "safe": (default) Catches errors and converts them to failed RuleResults
 *   - "unsafe": Lets errors propagate normally (for performance-critical cases)
 *
 * @property errorTransform - Optional custom error transformation function
 *   Only valid when errorHandlingMode is "safe" (or omitted); combining it with
 *   "unsafe" is a compile error because the transform would never run. Allows customizing how thrown errors
 *   are converted to the rule's error type.
 *
 * @example
 * // Basic usage with default safe handling
 * const rule = every([rule1, rule2], { errorHandlingMode: "safe" });
 *
 * @example
 * // Unsafe mode for performance
 * const rule = every([rule1, rule2], { errorHandlingMode: "unsafe" });
 *
 * @example
 * // Custom error transformation
 * const rule = every([rule1, rule2], {
 *   errorHandlingMode: "safe",
 *   errorTransform: (err) => ({
 *     code: 500,
 *     message: String(err)
 *   })
 * });
 */
export type RuleSafetyOptions<TError = unknown> =
  | {
      errorHandlingMode?: "safe";
      errorTransform?: (error: unknown) => TError;
    }
  | {
      errorHandlingMode: "unsafe";
      errorTransform?: never;
    };

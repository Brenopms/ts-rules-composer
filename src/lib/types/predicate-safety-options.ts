/**
 * Configuration options for error handling behavior in rule combinators
 * @template TError - The type of the error that will be caught and transformed (when safe)
 *
 *
 * @property predicateErrorTransform - Optional custom error transformation function
 *   Only used when errorHandling="safe". Allows customizing how thrown errors
 *   are converted to the rule's error type.
 *
 *
 * @example
 * // Custom error transformation
 * const rule = ifElse(
 *   (user) => user.age >= 18,
 *   validateAdultAccount,
 *   validateMinorAccount,
 *   {
 *      predicateErrorTransform: (err) => ({
 *           code: 500,
 *           message: String(err)
 *       })
 *    }
 * );
 */
export type PredicateSafetyOptions<TError = unknown> = {
  predicateErrorTransform?: (error: unknown) => TError;
};

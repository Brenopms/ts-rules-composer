import type { Predicate, PredicateSafe, PredicateResult } from "../../types";

/**
 * Wraps a predicate function with error handling and type safety.
 * @template TInput - The input type
 * @template TError - The error type (defaults to string)
 * @template TContext - The context type
 * @param predicate - The predicate function to wrap
 * @param errorTransform - Optional function to transform errors
 * @returns A safe predicate that never throws
 *
 * @example
 * const safePredicate = withSafePredicate(
 *   (input: string) => input.length > 5,
 *   (err) => `Predicate failed: ${String(err)}`
 * );
 *
 *  @caveats
 *  **Error Handling Behavior**:
 * - Will catch both synchronous throws and Promise rejections
 * - Errors in the errorTransform itself will propagate (not caught)
 * - The default transformer converts all errors to strings except Error objects
 *
 *  **Edge Cases**:
 * - Returns failed result for non-boolean returns (including null/undefined)
 * - Returns failed result for Promise<non-boolean> resolutions
 * - Returns failed result for Promise rejections (transformed via errorTransform)
 * - Returns failed result for thrown non-Error values (like `throw "string"`)
 */
export const withSafePredicate = <TInput, TError = string, TContext = unknown>(
  predicate: Predicate<TInput, TContext>,
  errorTransform: (error: unknown) => TError = (e) => {
    // Preserve object structure if TError is object-like
    if (typeof e === "object" && e !== null) return e as TError;
    // Default to string for primitives/errors
    return (e instanceof Error ? e.message : String(e)) as TError;
  },
): PredicateSafe<TInput, TError, TContext> => {
  return async (
    input: TInput,
    context?: TContext,
  ): Promise<PredicateResult<TError>> => {
    try {
      const result = await predicate(input, context);

      // Check if result is a boolean
      if (typeof result === "boolean") {
        return { status: "passed", value: result };
      }

      return {
        status: "failed",
        error: errorTransform(
          new Error(`Predicate must return boolean, got ${typeof result}`),
        ),
      };
    } catch (error) {
      return {
        status: "failed",
        error: errorTransform(error),
      };
    }
  };
};

/**
 * Type guard to check if context exists and is of type T.
 * @template T - The expected context type
 * @param ctx - The context to check
 * @returns Boolean indicating if context exists and matches type
 * @example
 * if (hasContext<AdminContext>(context)) {
 *   // context is now typed as AdminContext
 * }
 */
export const hasContext = <T>(ctx: T | undefined): ctx is T => {
  return ctx !== undefined;
};

/**
 * How `combine` merges outcomes (`combineAll` uses only `combine`). Both
 * methods are synchronous: a method that throws, returns a promise or
 * returns a malformed value ends the whole `combine` with `onError`.
 * @template O - The outcome labels
 * @example
 * // The strongest outcome wins, but every decision runs (e.g. for auditing).
 * const runAll: Resolver<CreditOutcome> = {
 *   combine: (current, next) =>
 *     credit.outcomes.indexOf(next) < credit.outcomes.indexOf(current)
 *       ? next
 *       : current,
 *   isFinal: () => false,
 * };
 * const auditedPolicy = credit.combine([affordability, employment], {
 *   resolver: runAll,
 * });
 */
export type Resolver<O extends string> = {
  /** Merge the outcome so far with the next one. Returns a declared outcome. */
  readonly combine: (current: O, next: O) => O;
  /** True when no later outcome can change the result (`combine` stops). */
  readonly isFinal: (current: O) => boolean;
};

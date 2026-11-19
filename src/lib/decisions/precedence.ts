import type { Resolver } from "../types";

/**
 * The default resolver: of two outcomes, the one declared first wins, and
 * only the first declared outcome is final. Labels are already validated
 * when they reach it. Internal.
 */
export const byPrecedence = <O extends string>(
  outcomes: readonly O[],
): Resolver<O> => {
  const rank = new Map(outcomes.map((outcome, index) => [outcome, index]));
  const rankOf = (outcome: O): number => rank.get(outcome) ?? outcomes.length;
  return {
    combine: (current, next) =>
      rankOf(next) < rankOf(current) ? next : current,
    isFinal: (current) => rankOf(current) === 0,
  };
};

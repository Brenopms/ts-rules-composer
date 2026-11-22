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

/**
 * The built-in resolvers bound to `outcomes`, all frozen. `strongestWins`
 * is the default resolver; `runEveryCheck` shares its `combine` but is
 * never final, so a sequential `combine` calls every child. Internal.
 */
export const builtInResolvers = <O extends string>(outcomes: readonly O[]) => {
  const strongestWins: Resolver<O> = Object.freeze(byPrecedence(outcomes));
  const runEveryCheck: Resolver<O> = Object.freeze({
    combine: strongestWins.combine,
    isFinal: () => false,
  });
  return Object.freeze({ strongestWins, runEveryCheck });
};

import type { Resolver } from "../types";

/**
 * Sequential fold for `toolkit.combine`: starts from the first child's
 * outcome, merges each next one with `resolver.combine`, and stops as soon as
 * `resolver.isFinal` is true (checked after the first child too, never when
 * no child is left). `run` never rejects; a resolver method that fails throws,
 * and the caller ends the whole `combine` with `onError`. Internal.
 */
export const foldSequential = async <TChild, O extends string>(
  children: readonly [TChild, ...TChild[]],
  run: (child: TChild) => Promise<O>,
  resolver: Resolver<O>,
): Promise<O> => {
  let current = await run(children[0]);
  for (
    let index = 1;
    index < children.length && !resolver.isFinal(current);
    index++
  ) {
    current = resolver.combine(current, await run(children[index]));
  }
  return current;
};

/**
 * Parallel fold for `toolkit.combineAll`: starts every child at once, waits
 * for all of them, then merges the outcomes with `resolver.combine` in
 * declaration order (whatever order they finished in). The resolver needs
 * no `isFinal`. `run` never rejects; a `combine` that fails throws, and the
 * caller ends the whole `combineAll` with `onError`. Internal.
 */
export const foldParallel = async <TChild, O extends string>(
  children: readonly [TChild, ...TChild[]],
  run: (child: TChild) => Promise<O>,
  resolver: Pick<Resolver<O>, "combine">,
): Promise<O> => {
  const outcomes: O[] = await Promise.all(children.map(run));
  // Non-empty, so reduce needs no seed; one child returns without a merge.
  return outcomes.reduce((current, next) => resolver.combine(current, next));
};

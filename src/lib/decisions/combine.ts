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

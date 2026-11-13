import { attachNode, type Fn } from "./node";

/**
 * Gives a rule (or predicate, accessor or getter) a readable name for
 * `toGraph` and `toMermaid`. Behavior is unchanged: the returned function
 * forwards its arguments and result as-is, and the function you pass in is
 * not modified.
 *
 * @example
 * const adult = named("Is adult", (user: User) => user.age >= 18);
 * const minAge = (years: number) =>
 *   named(`Min age ${years}`, ageRule(years), { params: { years } });
 * @caveats
 * - A named rule is described as a single box, even if it was built from
 *   combinators. Use that to collapse a sub-pipeline in a diagram.
 * - The wrapper adds one function call per invocation.
 */
export const named = <F extends Fn>(
  name: string,
  fn: F,
  options?: { params?: Record<string, unknown> },
): F =>
  attachNode(((...args: never[]) => fn(...args)) as F, {
    kind: "rule",
    label: name,
    ...(options?.params ? { params: options.params } : {}),
  });

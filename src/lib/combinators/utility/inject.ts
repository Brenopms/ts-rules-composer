import type { Rule } from "../../types";

/**
 * Injects a dependency into a rule creation function, returning a configured rule.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error
 * @template TDep - The type of the dependency to inject
 * @param dependency - The dependency to inject
 * @param rule - A function that creates a rule when given the dependency
 * @returns A configured rule that uses the injected dependency
 * @example
 * const createDbRule = (db: Database) => (input: string) =>
 *   db.exists(input) ? pass() : fail("Not found");
 *
 * const dbRule = inject(database, createDbRule);
 * @caveats
 * - The dependency is injected at rule creation time, not execution time
 */
export const inject = <TInput, TError, TDep>(
  dependency: TDep,
  rule: (dep: TDep) => Rule<TInput, TError>,
): Rule<TInput, TError> => {
  const configuredRule = rule(dependency);
  return (input) => configuredRule(input);
};

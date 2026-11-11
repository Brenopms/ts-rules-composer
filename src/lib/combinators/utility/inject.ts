import type { Rule } from "../../types";

/**
 * Injects a dependency into a rule creation function, returning a configured rule.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error
 * @template TDep - The type of the dependency to inject
 * @template TContext - The type of the context object (optional, defaults to unknown)
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
 * - The execution context is forwarded to the configured rule
 */
export const inject = <TInput, TError, TDep, TContext = unknown>(
  dependency: TDep,
  rule: (dep: TDep) => Rule<TInput, TError, TContext>,
): Rule<TInput, TError, TContext> => {
  const configuredRule = rule(dependency);
  return (input, context) => configuredRule(input, context);
};

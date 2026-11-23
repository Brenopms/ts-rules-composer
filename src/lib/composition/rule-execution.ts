import { getNormalizedRules, pass } from "../helpers";
import { getCloneFn } from "../helpers/clone/getCloneFn";
import {
  collectedFailure,
  type Failed,
  isCaught,
  isFailed,
} from "../helpers/result/caught";
import type { CompositionOptions, Rule, RuleResult } from "../types";

/**
 * Three-valued AND over results in declaration order: any unmarked failure →
 * a plain failure (a confirmed no); else any caught failure → caught, with
 * the first declared one's cause; else a pass.
 */
const allOf = <TError>(
  results: readonly RuleResult<TError>[],
): RuleResult<TError[]> => {
  const failures: Failed<TError>[] = results.filter(isFailed);
  if (failures.length === 0) return pass();
  return collectedFailure(
    failures.map((failure) => failure.error),
    failures.every(isCaught) ? failures[0] : undefined,
  );
};

type ExecutionPolicy =
  | "forwardFailFast"
  | "reverseFailFast"
  | "parallelCollect";

export function prepareRuleExecution<TInput, TError, TContext>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions<TError>,
  policy: "forwardFailFast" | "reverseFailFast",
): Rule<TInput, TError, TContext>;
export function prepareRuleExecution<TInput, TError, TContext>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions<TError>,
  policy: "parallelCollect",
): Rule<TInput, TError[], TContext>;
export function prepareRuleExecution<TInput, TError, TContext>(
  rules: Rule<TInput, TError, TContext>[],
  options: CompositionOptions<TError>,
  policy: ExecutionPolicy,
): Rule<TInput, TError | TError[], TContext> {
  const normalizedRules = getNormalizedRules([...rules], options);
  const cloneFn = getCloneFn(options);
  const shouldCloneContext = options.cloneContext;

  return async (input: TInput, context?: TContext) => {
    const currentContext = shouldCloneContext ? cloneFn(context) : context;

    if (policy === "parallelCollect") {
      const results = await Promise.all(
        normalizedRules.map((rule) => rule(input, currentContext)),
      );
      return allOf(results);
    }

    const rulesInOrder =
      policy === "forwardFailFast"
        ? normalizedRules
        : [...normalizedRules].reverse();

    for (const rule of rulesInOrder) {
      const result = await rule(input, currentContext);
      if (result.outcome === "failed") {
        return result;
      }
    }

    return pass();
  };
}

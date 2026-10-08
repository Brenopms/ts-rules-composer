import { fail, getNormalizedRules, pass } from "../helpers";
import { getCloneFn } from "../helpers/clone/getCloneFn";
import type { CompositionOptions, Rule } from "../types";

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
      const errors = results.flatMap((result) =>
        result.status === "failed" ? [result.error] : [],
      );
      return errors.length > 0 ? fail(errors) : pass();
    }

    const rulesInOrder =
      policy === "forwardFailFast"
        ? normalizedRules
        : [...normalizedRules].reverse();

    for (const rule of rulesInOrder) {
      const result = await rule(input, currentContext);
      if (result.status === "failed") {
        return result;
      }
    }

    return pass();
  };
}

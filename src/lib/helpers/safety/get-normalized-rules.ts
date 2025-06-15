import { withSafeError } from "../../combinators";
import type { Rule, SafetyOptions } from "../../types";

export const getNormalizedRules = <TInput, TError, TContext>(
  rules: Rule<TInput, TError, TContext>[],
  opts: SafetyOptions<TError>,
): Rule<TInput, TError, TContext>[] => {
  const normalizedRules =
    opts?.errorHandlingMode === "unsafe"
      ? rules
      : (rules || [])?.map((rule) => withSafeError(rule, opts?.errorTransform));

  return normalizedRules;
};

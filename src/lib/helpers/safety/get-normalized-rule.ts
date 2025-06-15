import { withSafeError } from "../../combinators";
import type { Rule, SafetyOptions } from "../../types";

export const getNormalizedRule = <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
  opts: SafetyOptions<TError>,
): Rule<TInput, TError, TContext> => {
  const normalizedRule =
    opts?.errorHandlingMode === "unsafe"
      ? rule
      : withSafeError(rule, opts?.errorTransform);

  return normalizedRule;
};

import { Rule } from "../../types";

export const inject = <TInput, TError, TDep>(
  dependency: TDep,
  rule: (dep: TDep) => Rule<TInput, TError>,
): Rule<TInput, TError> => {
  const configuredRule = rule(dependency);
  return (input) => configuredRule(input);
};

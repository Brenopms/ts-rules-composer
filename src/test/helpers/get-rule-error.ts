import { RuleResult } from "../../lib/types";

export const getError = <TError>(result: RuleResult<TError>): TError => {
  if (result.status !== "failed") {
    throw new Error("Cannot get error from passed result");
  }
  return result.error;
};

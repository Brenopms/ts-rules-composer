import type { PredicateSafetyOptions } from "./predicate-safety-options";
import type { Prettify } from "./prettify";
import type { RuleSafetyOptions } from "./rule-safety-options";

export type SafetyOptions<TError = unknown> = Prettify<
  RuleSafetyOptions<TError> & PredicateSafetyOptions<TError>
>;

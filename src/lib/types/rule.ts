import type { RuleResult } from "./rule-result";

/**
 * A function that validates an input and returns a RuleResult.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @param input - The input value to validate
 * @param context - Optional context object that can be used during validation
 * @returns Either a Promise of RuleResult or RuleResult directly
 * @example
 * const isEven: Rule<number> = (input) => {
 *   return input % 2 === 0
 *     ? { status: "passed" }
 *     : { status: "failed", error: "Number must be even" };
 * };
 */
export type Rule<TInput, TError = string, TContext = unknown> = (
  input: TInput,
  context?: TContext,
) => Promise<RuleResult<TError>> | RuleResult<TError>;

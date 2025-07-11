import { pass } from "../../helpers";
import type { Rule } from "../../types";

/**
 * Creates a standalone tap effect for use in composition pipelines
 * @template TInput - Input type
 * @template TError - Error type
 * @template TContext - Context type
 * @param effect - Side effect function receiving (input, context)
 * @returns A rule that passes through input unchanged
 * @example
 * pipeRules([
 *   tap((input) => console.log('Processing:', input)),
 *   validateInput
 * ])
 */
export const tap = <TInput, TError = string, TContext = unknown>(
  effect: (input: TInput, context?: TContext) => Promise<void> | void,
): Rule<TInput, TError, TContext> => {
  return async (input, context) => {
    try {
      await effect(input, context);
    } catch (error) {
      console.error("Tap effect failed: ", error);
    }
    return pass();
  };
};

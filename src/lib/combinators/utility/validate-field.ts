import { fail, getNormalizedRule } from "../../helpers";
import type { Rule, RuleSafetyOptions } from "../../types";

/**
 * Creates a rule that extracts a value using a getter function and validates it.
 * @template TInput - The type of the input object
 * @template TValue - The type of the extracted value
 * @template TError - The type of the error
 * @template TContext - The type of the context object
 * @param getter - Function that extracts the value from input
 * @param rule - Rule to apply to the extracted value
 * @param defaultValue - Optional default value if getter returns undefined
 * @param options - Configuration for error handling safety
 * @param options.errorHandlingMode - Determines how errors are handled:
 *   - 'safe': (default) Converts thrown errors to validation failures
 *   - 'unsafe': Lets errors propagate (use only in performance-critical paths)
 * @param options.errorTransform - Custom transformation for caught errors
 * @returns A new rule that validates the extracted value
 * @example
 * const validateName = validateField(
 *   (user: User) => user.profile.name,
 *   (name) => name.length > 3 ? pass() : fail('Name too short')
 * );
 *
 * const validateAge = validateField(
 *   (user: User) => user.age,
 *   (age) => age >= 18 ? pass() : fail('Must be adult'),
 *   18 // default value
 * );
 *
 * @caveats
 * **Null/Undefined Handling**:
 *    - The getter function should handle optional properties (use optional chaining)
 *    - If getter returns undefined and no default is provided, the rule will fail
 *
 *  **Type Safety**:
 *    - The rule's input type must match the getter's return type exactly
 *    - No automatic type narrowing (e.g., string | undefined won't become string even with default)
 *
 *  **Default Values**:
 *    - Defaults are applied before rule execution (the rule sees the default value)
 *    - Default values aren't type-checked against potentially undefined returns
 */
export function validateField<
  TInput,
  TValue,
  TError = string,
  TContext = unknown,
>(
  getter: (input: TInput) => TValue | undefined,
  rule: Rule<TValue, TError, TContext>,
  defaultValue?: TValue,
  options?: RuleSafetyOptions<TError>,
): Rule<TInput, TError, TContext> {
  return async (input: TInput, context?: TContext) => {
    const value = getter(input);
    const finalValue = value !== undefined ? value : defaultValue;
    const safeRule = getNormalizedRule(rule, options);

    if (finalValue === undefined) {
      return fail("Missing required value" as unknown as TError);
    }

    return safeRule(finalValue, context);
  };
}

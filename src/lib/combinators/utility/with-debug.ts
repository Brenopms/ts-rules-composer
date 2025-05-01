import { DebugOptions, Rule } from "../../types";

/**
 * Wraps a rule with debugging capabilities.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error
 * @template TContext - The type of the context object
 * @param rule - The rule to wrap with debug capabilities
 * @param options - Debug configuration or simple name string
 * @param options.name - Name for the debug output
 * @param options.onStart - Callback when rule starts executing
 * @param options.onEnd - Callback when rule completes successfully
 * @param options.onError - Callback when rule throws an error
 * @returns A new rule with debug capabilities
 * @example
 * const rule = withDebug(expensiveValidation, {
 *   name: "Expensive Validation",
 *   onStart: (input) => console.log(`Starting with input: ${input}`),
 *   onEnd: (input, result, ctx, { duration }) => {
 *     console.log(`Completed in ${duration}ms`);
 *   }
 * });
 * @caveats
 * - Debug callbacks are executed synchronously and may impact performance
 * - Errors in callbacks will propagate and potentially mask rule errors
 */
export const withDebug = <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
  options: DebugOptions<TInput, TError, TContext> | string,
): Rule<TInput, TError, TContext> => {
  const config = typeof options === "string" ? { name: options } : options;

  return async (input, context) => {
    const startTime = performance.now();
    const ruleName = config.name || rule.name || "anonymous_rule";

    try {
      config.onStart?.(input, context);
      const result = await rule(input, context);
      const duration = performance.now() - startTime;

      config.onEnd?.(input, result, context, {
        ruleName,
        duration,
        startTime,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      config.onError?.(error, input, context, duration);
      throw error; // Preserve original error throwing behavior
    }
  };
};

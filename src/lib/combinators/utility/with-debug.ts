import { DebugOptions, Rule } from "../../types";

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

import { fail, getNormalizedRule } from "../../helpers";
import type { Rule, RuleResult, RuleSafetyOptions } from "../../types";

const isRule = <TInput, TError, TContext>(
  value: unknown,
): value is Rule<TInput, TError, TContext> => {
  return typeof value === "function";
};

/**
 * Pattern-matching combinator that selects a rule based on a key extracted from input.
 * @template TInput - The type of the input to validate
 * @template TError - The type of the error (defaults to string)
 * @template TContext - The type of the context object (optional)
 * @template TKey - The type of the branch key (must be string | number | symbol)
 * @param accessor - Function that extracts the match key from input
 * @param cases - Object mapping keys to their corresponding rules
 * @param defaultCase - Optional default rule or error when no match is found
 * @returns A new rule that executes the matching case's rule
 * @example
 * // Basic usage with string error type
 * const validatePayment = match(
 *   (order) => order.paymentMethod,
 *   {
 *     credit: validateCreditCard,
 *     paypal: validatePayPal,
 *     crypto: validateCrypto
 *   },
 *   "Unsupported payment method"
 * );
 *
 * @example
 * // With custom error type
 * interface ValidationError { code: number; message: string }
 * const validateStatus = match<Order, ValidationError>(
 *   (order) => order.status,
 *   {
 *     pending: validatePendingOrder,
 *     completed: validateCompletedOrder
 *   },
 *   { code: 400, message: "Invalid status" }
 * );
 *
 * @example
 * // With default rule instead of error
 * const validateProduct = match(
 *   (product) => product.type,
 *   {
 *     book: validateBook,
 *     digital: validateDigitalProduct
 *   },
 *   validateGenericProduct
 * );
 *
 * @caveats
 * - The accessor function should return a primitive value (string/number/symbol)
 * - If no matching case is found and no default is provided, returns a failed result with:
 *   - A string error when TError is string (default)
 *   - A type-asserted error when TError is custom (may require type casting)
 * - All case rules must have compatible input/context types
 * - For conditional branching (true/false), consider using `branch` instead
 */
export const match = <
  TInput,
  TError = string,
  TContext = unknown,
  TKey extends string | number | symbol = string,
>(
  accessor: (input: TInput, context?: TContext) => TKey | Promise<TKey>,
  cases: Record<TKey, Rule<TInput, TError, TContext>>,
  defaultCase?: Rule<TInput, TError, TContext> | TError,
  options?: RuleSafetyOptions<TError>,
): Rule<TInput, TError, TContext> => {
  return async (
    input: TInput,
    context?: TContext,
  ): Promise<RuleResult<TError>> => {
    const key = await accessor(input, context);
    const matchedRule = cases[key];

    if (matchedRule) {
      const safeMatchedRule = getNormalizedRule(matchedRule, options);
      return safeMatchedRule(input, context);
    }

    if (defaultCase !== undefined) {
      // if default case is not a rule, fail the error/messae directly
      if (!isRule<TInput, TError, TContext>(defaultCase)) {
        return fail(defaultCase);
      }

      const safeDefaultCase = getNormalizedRule(
        defaultCase as Rule<TInput, TError, TContext>,
        options,
      );
      return safeDefaultCase(input, context);
    }

    return fail(`No matching rule for key: ${String(key)}` as TError);
  };
};

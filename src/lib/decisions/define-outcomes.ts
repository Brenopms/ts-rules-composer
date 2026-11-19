import type { DecisionResult } from "../types";

/**
 * A declared outcome set and the decision builders bound to it, returned by
 * {@link defineOutcomes}. Frozen.
 * @template O - The outcome labels
 */
export interface OutcomeToolkit<O extends string> {
  /** Declaration order = precedence, strongest first. */
  readonly outcomes: readonly O[];
  /** The outcome any failure while deciding resolves to. */
  readonly onError: O;

  /**
   * Typed result builder for hand-written decisions, like `pass()`/`fail()`
   * for rules. Throws `TypeError` for a label outside the set.
   * @example
   * const bureauScore: Decision<CreditApplication, CreditOutcome> = async (app) => {
   *   const score = await creditBureau.score(app.applicantId);
   *   if (score >= 700) return credit.outcome("approved");
   *   if (score >= 600) return credit.outcome("review");
   *   return credit.outcome("declined");
   * };
   */
  outcome(outcome: O): DecisionResult<O>;
}

/**
 * The outcome labels of a toolkit.
 * @example
 * type CreditOutcome = OutcomeOf<typeof credit>; // "declined" | "review" | "approved"
 */
export type OutcomeOf<T> = T extends OutcomeToolkit<infer O> ? O : never;

const quoted = (value: unknown) => `"${String(value)}"`;

const validateOutcomes = (outcomes: unknown): readonly string[] => {
  if (!Array.isArray(outcomes)) {
    throw new TypeError("defineOutcomes: outcomes must be an array");
  }
  if (outcomes.length === 0) {
    throw new TypeError("defineOutcomes: outcomes must not be empty");
  }
  const seen = new Set<string>();
  outcomes.forEach((outcome: unknown, index) => {
    if (typeof outcome !== "string" || outcome === "") {
      throw new TypeError(
        `defineOutcomes: outcomes[${index}] must be a non-empty string`,
      );
    }
    if (seen.has(outcome)) {
      throw new TypeError(
        `defineOutcomes: duplicate outcome ${quoted(outcome)}`,
      );
    }
    seen.add(outcome);
  });
  return Object.freeze([...outcomes]);
};

/**
 * Declares an outcome set once and returns the decision toolkit bound to it.
 * Declaration order is precedence: an earlier outcome outranks every later
 * one. Throws `TypeError` for an invalid set or options.
 * @param outcomes - Non-empty, unique, non-empty strings (no `as const` needed)
 * @param options.onError - The declared outcome any failure while deciding resolves to
 * @param options.onErrorCaught - Called with every failure turned into `onError`
 * @example
 * const credit = defineOutcomes(["declined", "review", "approved"], {
 *   onError: "review",
 * });
 * type CreditOutcome = OutcomeOf<typeof credit>; // "declined" | "review" | "approved"
 */
export const defineOutcomes = <const T extends readonly [string, ...string[]]>(
  outcomes: T,
  options: {
    readonly onError: T[number];
    /** Called with every failure that was turned into an onError outcome. */
    readonly onErrorCaught?: (error: unknown) => void;
  },
): OutcomeToolkit<T[number]> => {
  type O = T[number];
  const declared = validateOutcomes(outcomes) as readonly O[];
  const isDeclared = (value: unknown): value is O =>
    declared.includes(value as O);

  const onError = options?.onError;
  if (onError === undefined) {
    throw new TypeError("defineOutcomes: options.onError is required");
  }
  if (!isDeclared(onError)) {
    throw new TypeError(
      `defineOutcomes: onError ${quoted(onError)} is not a declared outcome`,
    );
  }
  if (
    options.onErrorCaught !== undefined &&
    typeof options.onErrorCaught !== "function"
  ) {
    throw new TypeError(
      "defineOutcomes: options.onErrorCaught must be a function",
    );
  }

  return Object.freeze({
    outcomes: declared,
    onError,
    outcome: (outcome: O): DecisionResult<O> => {
      if (!isDeclared(outcome)) {
        throw new TypeError(
          `outcome: ${quoted(outcome)} is not a declared outcome`,
        );
      }
      return { outcome };
    },
  });
};

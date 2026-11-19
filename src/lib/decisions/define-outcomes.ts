import type { Decision, DecisionResult, Predicate } from "../types";
import { branch } from "./branch";
import { type ErrorHook, runSafely, toBoolean, toKey } from "./run-safely";
import { switchCase } from "./switch";

/** A declared outcome (constant decision) or a decision to run. */
type Branch<TInput, O extends string, TContext> =
  | O
  | Decision<TInput, O, TContext>;

/** Per-combinator override of the toolkit's `onError`. */
type Override<O extends string> = { readonly onError?: O };

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

  /**
   * Picks an outcome from a yes/no question: `true` runs `whenTrue`, `false`
   * runs `whenFalse`. A bare-string branch is a constant outcome, checked
   * when `ifElse` is called (`TypeError` for an unknown one). While running,
   * a predicate that throws, rejects or returns a non-boolean, or a branch
   * that fails or returns a malformed result, gives `onError` (the override,
   * else the toolkit's). Never throws or rejects.
   * @example
   * const affordability = credit.ifElse(
   *   (app: CreditApplication) => app.monthlyDebt / app.monthlyIncome > 0.5,
   *   "declined",
   *   "approved",
   * );
   */
  ifElse<TInput, TContext = unknown>(
    predicate: Predicate<TInput, TContext>,
    whenTrue: Branch<TInput, O, TContext>,
    whenFalse: Branch<TInput, O, TContext>,
    options?: Override<O>,
  ): Decision<TInput, O, TContext>;

  /**
   * Picks an outcome by key: the accessor's key selects its own case
   * (`Object.hasOwn`, so an inherited `toString` is a miss), and any other
   * key runs `defaultCase`. Every supplied case and `defaultCase` must be a
   * declared outcome or a decision, checked when `match` is called
   * (`TypeError` otherwise, even for a case set to `undefined`). While
   * running, an accessor that throws, rejects or returns anything but a
   * string, number or symbol gives `onError` and runs no case; so does a
   * case that fails or returns a malformed result. Never throws or rejects.
   * @example
   * const employment = credit.match(
   *   (app: CreditApplication) => app.employment,
   *   {
   *     employed: "approved",
   *     self_employed: "review",
   *     unemployed: "declined",
   *   },
   *   "review",
   * );
   */
  match<TInput, TKey extends PropertyKey, TContext = unknown>(
    accessor: (input: TInput, context?: TContext) => TKey | Promise<TKey>,
    cases: Partial<Record<TKey, Branch<TInput, O, TContext>>>,
    defaultCase: Branch<TInput, O, TContext>,
    options?: Override<O>,
  ): Decision<TInput, O, TContext>;
}

/**
 * The outcome labels of a toolkit.
 * @example
 * type CreditOutcome = OutcomeOf<typeof credit>; // "declined" | "review" | "approved"
 */
export type OutcomeOf<T> = T extends OutcomeToolkit<infer O> ? O : never;

/**
 * A label for an error message. Never converts a non-string: an object's
 * `toString` may throw and replace the `TypeError` being built.
 */
const display = (value: unknown): string =>
  typeof value === "string"
    ? `"${value}"`
    : `(${value === null ? "null" : typeof value})`;

const validateOutcomes = (outcomes: unknown): readonly string[] => {
  if (!Array.isArray(outcomes)) {
    throw new TypeError("defineOutcomes: outcomes must be an array");
  }
  if (outcomes.length === 0) {
    throw new TypeError("defineOutcomes: outcomes must not be empty");
  }
  // An indexed loop, not forEach: forEach skips the holes of a sparse array.
  const declared: string[] = [];
  for (let index = 0; index < outcomes.length; index++) {
    const outcome: unknown = outcomes[index];
    if (typeof outcome !== "string" || outcome === "") {
      throw new TypeError(
        `defineOutcomes: outcomes[${index}] must be a non-empty string`,
      );
    }
    if (declared.includes(outcome)) {
      throw new TypeError(
        `defineOutcomes: duplicate outcome ${display(outcome)}`,
      );
    }
    declared.push(outcome);
  }
  return Object.freeze(declared);
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
      `defineOutcomes: onError ${display(onError)} is not a declared outcome`,
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

  const hook: ErrorHook | undefined = options.onErrorCaught;

  const notDeclared = (where: string, value: unknown) =>
    new TypeError(`${where} ${display(value)} is not a declared outcome`);

  /** The combinator's `onError`: its override (validated now), else the toolkit's. */
  const localOnError = (combinator: string, override?: Override<O>): O => {
    const value = override?.onError;
    if (value === undefined) return onError;
    if (!isDeclared(value)) throw notDeclared(`${combinator}: onError`, value);
    return value;
  };

  /** A bare-string branch becomes a constant decision, validated now. */
  const toDecision = <TInput, TContext>(
    where: string,
    value: Branch<TInput, O, TContext>,
  ): Decision<TInput, O, TContext> => {
    if (typeof value === "function") return value;
    if (typeof value !== "string") {
      throw new TypeError(
        `${where} must be a declared outcome or a decision function`,
      );
    }
    if (!isDeclared(value)) throw notDeclared(where, value);
    return () => ({ outcome: value });
  };

  /** Check for child decisions: an own `outcome` key holding a declared label. */
  const toLabel = (value: unknown): O => {
    if (
      typeof value !== "object" ||
      value === null ||
      !Object.hasOwn(value, "outcome")
    ) {
      throw new TypeError("decision must return an object with an own outcome");
    }
    const { outcome } = value as { outcome: unknown };
    if (!isDeclared(outcome)) {
      throw new TypeError(
        `decision returned ${display(outcome)}, which is not a declared outcome`,
      );
    }
    return outcome;
  };

  /** Runs a child decision; any failure gives `fallback`. Fresh result. */
  const runDecision = async <TInput, TContext>(
    decision: Decision<TInput, O, TContext>,
    input: TInput,
    context: TContext | undefined,
    fallback: O,
  ): Promise<DecisionResult<O>> => {
    const result = await runSafely(
      () => decision(input, context),
      toLabel,
      hook,
    );
    return { outcome: result.ok ? result.value : fallback };
  };

  /**
   * Validates every own case (symbol keys included) and copies them into a
   * null-prototype table, so later changes to `cases` change nothing.
   */
  const toCaseTable = <TInput, TContext>(
    cases: Partial<Record<PropertyKey, Branch<TInput, O, TContext>>>,
  ): Record<PropertyKey, Decision<TInput, O, TContext>> => {
    if (typeof cases !== "object" || cases === null) {
      throw new TypeError("match: cases must be an object");
    }
    const table: Record<
      PropertyKey,
      Decision<TInput, O, TContext>
    > = Object.create(null);
    for (const key of Reflect.ownKeys(cases)) {
      table[key] = toDecision(
        `match: cases[${display(key)}]`,
        cases[key] as Branch<TInput, O, TContext>,
      );
    }
    return table;
  };

  const toolkit: OutcomeToolkit<O> = {
    outcomes: declared,
    onError,
    outcome: (outcome) => {
      if (!isDeclared(outcome)) throw notDeclared("outcome:", outcome);
      return { outcome };
    },
    ifElse: (predicate, whenTrue, whenFalse, override) => {
      const yes = toDecision("ifElse: whenTrue", whenTrue);
      const no = toDecision("ifElse: whenFalse", whenFalse);
      const fallback = localOnError("ifElse", override);
      return async (input, context) => {
        const condition = await runSafely(
          () => predicate(input, context),
          toBoolean,
          hook,
        );
        if (!condition.ok) return { outcome: fallback };
        return runDecision(
          branch(condition.value, yes, no),
          input,
          context,
          fallback,
        );
      };
    },
    match: (accessor, cases, defaultCase, override) => {
      const table = toCaseTable(cases);
      const otherwise = toDecision("match: defaultCase", defaultCase);
      const fallback = localOnError("match", override);
      return async (input, context) => {
        const key = await runSafely(
          () => accessor(input, context),
          toKey,
          hook,
        );
        if (!key.ok) return { outcome: fallback };
        return runDecision(
          switchCase(
            key.value,
            (k) => (Object.hasOwn(table, k) ? table[k] : undefined),
            otherwise,
          ),
          input,
          context,
          fallback,
        );
      };
    },
  };
  return Object.freeze(toolkit);
};

import type { Decision, DecisionResult, Predicate, Resolver } from "../types";
import { branch } from "./branch";
import { foldSequential } from "./combine";
import { byPrecedence } from "./precedence";
import {
  type ErrorHook,
  ignoreRejection,
  notify,
  runSafely,
  toBoolean,
  toKey,
} from "./run-safely";
import { switchCase } from "./switch";

/** A declared outcome (constant decision) or a decision to run. */
type Branch<TInput, O extends string, TContext> =
  | O
  | Decision<TInput, O, TContext>;

/** Per-combinator override of the toolkit's `onError`. */
type Override<O extends string> = { readonly onError?: O };

/** A non-empty list of decisions, for `combine`. */
type Decisions<TInput, O extends string, TContext> = readonly [
  Decision<TInput, O, TContext>,
  ...Decision<TInput, O, TContext>[],
];

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

  /**
   * Runs decisions one at a time, in order, and merges their outcomes with
   * the resolver (default: precedence, so the outcome declared first wins and
   * the first declared outcome is final). Starts from the first decision's
   * outcome and stops as soon as `resolver.isFinal` is true; later decisions
   * are not called. A decision that fails or returns a malformed result
   * becomes `onError` and joins the merge. A resolver method that throws,
   * returns a promise or returns a malformed value ends the whole `combine`
   * with `onError`. `decisions`, `mode`, `resolver` and the `onError`
   * override are checked when `combine` is called (`TypeError`). Never
   * throws or rejects.
   * @example
   * // Stops at the first "declined"; otherwise the strongest outcome wins.
   * const creditPolicy = credit.combine([
   *   affordability,
   *   employment,
   *   bureauScore,
   * ]);
   */
  combine<TInput, TContext = unknown>(
    decisions: Decisions<TInput, O, TContext>,
    options?: Override<O> & {
      /** Default `"sequential"`. */
      readonly mode?: "sequential";
      /** Default: precedence (declaration order). */
      readonly resolver?: Resolver<O>;
    },
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
  const length = outcomes.length;
  if (length === 0) {
    throw new TypeError("defineOutcomes: outcomes must not be empty");
  }
  // An indexed loop over the length read once, not forEach (which skips the
  // holes of a sparse array). A hole never reads through to the prototype.
  const declared: string[] = [];
  for (let index = 0; index < length; index++) {
    const outcome: unknown = Object.hasOwn(outcomes, index)
      ? outcomes[index]
      : undefined;
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

  /**
   * Copies `decisions` over the length read once, checking each own entry is
   * a function. A hole never reads through to the prototype.
   */
  const toChildren = <TInput, TContext>(
    decisions: Decisions<TInput, O, TContext>,
  ): Decisions<TInput, O, TContext> => {
    if (!Array.isArray(decisions)) {
      throw new TypeError("combine: decisions must be an array");
    }
    const length = decisions.length;
    if (length === 0) {
      throw new TypeError("combine: decisions must not be empty");
    }
    const children: Decision<TInput, O, TContext>[] = [];
    for (let index = 0; index < length; index++) {
      const decision: unknown = Object.hasOwn(decisions, index)
        ? decisions[index]
        : undefined;
      if (typeof decision !== "function") {
        throw new TypeError(
          `combine: decisions[${index}] must be a decision function`,
        );
      }
      children.push(decision as Decision<TInput, O, TContext>);
    }
    return children as unknown as Decisions<TInput, O, TContext>;
  };

  const precedence = byPrecedence(declared);

  /**
   * The default resolver, or a custom one whose methods are read once now
   * and called with the resolver as `this`. Each result is checked
   * synchronously: a malformed one throws a `TypeError`.
   */
  const toResolver = (resolver: Resolver<O> | undefined): Resolver<O> => {
    if (resolver === undefined) return precedence;
    const combine: unknown =
      typeof resolver === "object" && resolver !== null
        ? resolver.combine
        : undefined;
    const isFinal: unknown =
      typeof combine === "function" ? resolver.isFinal : undefined;
    if (typeof combine !== "function" || typeof isFinal !== "function") {
      throw new TypeError(
        "combine: resolver must be an object with combine and isFinal functions",
      );
    }
    return {
      combine: (current, next) => {
        const merged: unknown = Reflect.apply(combine, resolver, [
          current,
          next,
        ]);
        if (isDeclared(merged)) return merged;
        ignoreRejection(merged);
        throw new TypeError(
          `resolver.combine returned ${display(merged)}, which is not a declared outcome`,
        );
      },
      isFinal: (current) => {
        const final: unknown = Reflect.apply(isFinal, resolver, [current]);
        if (typeof final === "boolean") return final;
        ignoreRejection(final);
        throw new TypeError(
          `resolver.isFinal must return a boolean, got ${final === null ? "null" : typeof final}`,
        );
      },
    };
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
    combine: (decisions, options) => {
      const children = toChildren(decisions);
      const mode = options?.mode;
      if (mode !== undefined && mode !== "sequential") {
        throw new TypeError('combine: mode must be "sequential"');
      }
      const resolver = toResolver(options?.resolver);
      const fallback = localOnError("combine", options);
      return async (input, context) => {
        const run = async (child: (typeof children)[number]) =>
          (await runDecision(child, input, context, fallback)).outcome;
        try {
          return { outcome: await foldSequential(children, run, resolver) };
        } catch (error) {
          // Only a resolver method throws here: it ends the whole combine.
          notify(hook, error);
          return { outcome: fallback };
        }
      };
    },
  };
  return Object.freeze(toolkit);
};

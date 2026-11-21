import type { Decision, DecisionResult, Predicate, Resolver } from "../types";
import { branch } from "./branch";
import { foldParallel, foldSequential } from "./combine";
import { checkFunction, display, isObject, toList } from "./guards";
import {
  localOnError,
  notDeclared,
  type OutcomeSet,
  toCaseTable,
  toChildren,
  toDecision,
  toMapping,
  toMerger,
  toResolver,
} from "./inputs";
import { byPrecedence } from "./precedence";
import {
  type ErrorHook,
  notify,
  runSafely,
  toBoolean,
  toKey,
  toRuleOutcome,
} from "./run-safely";
import { switchCase } from "./switch";

/** A declared outcome (constant decision) or a decision to run. */
export type Branch<TInput, O extends string, TContext> =
  | O
  | Decision<TInput, O, TContext>;

/** Per-combinator override of the toolkit's `onError`. */
export type Override<O extends string> = { readonly onError?: O };

/** A non-empty list of decisions, for `combine`. */
export type Decisions<TInput, O extends string, TContext> = readonly [
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
   * runs `whenFalse`. A bare-string branch is a constant outcome. The
   * predicate must be a function and each branch a declared outcome or a
   * decision, checked when `ifElse` is called (`TypeError` otherwise).
   * While running, a predicate that throws, rejects or returns a
   * non-boolean, or a branch that fails or returns a malformed result, gives
   * `onError` (the override, else the toolkit's). Never throws or rejects.
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
   * key runs `defaultCase`. The accessor must be a function, and every
   * supplied case and `defaultCase` a declared outcome or a decision,
   * checked when `match` is called (`TypeError` otherwise, even for a case
   * set to `undefined`). While
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
   * are not called. To run every decision at once, use
   * {@link OutcomeToolkit.combineAll}. To run every decision in order, pass
   * a resolver whose `isFinal` always returns `false`. A decision that fails
   * or returns a malformed result becomes `onError` and joins the merge. A
   * resolver method that throws, returns a promise or returns a malformed
   * value ends the whole `combine` with `onError`. `decisions`, `resolver` and the
   * `onError` override are checked when `combine` is called (`TypeError`).
   * Never throws or rejects. No timeouts: a decision that never settles
   * keeps the `combine` pending (`withTimeout` is for rules only).
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
      /** Default: precedence (declaration order). */
      readonly resolver?: Resolver<O>;
    },
  ): Decision<TInput, O, TContext>;

  /**
   * Runs every decision at once, waits for all of them, then merges their
   * outcomes with `resolver.combine` in declaration order (not the order
   * they finished in). Default: precedence, so the outcome declared first
   * wins. Nothing stops early, so the resolver needs only `combine`
   * (`isFinal` is never read; a full {@link Resolver} works too). This is
   * how to run every check with the default precedence. A decision
   * that fails or returns a malformed result becomes `onError` and joins the
   * merge. A `resolver.combine` that throws, returns a promise or returns a
   * malformed value ends the whole `combineAll` with `onError`.
   * `decisions`, `resolver` and the `onError` override are checked when
   * `combineAll` is called (`TypeError`). Never throws or rejects.
   *
   * No timeouts: a decision that never settles keeps the `combineAll`
   * pending, since it waits for every decision. `withTimeout` is for rules
   * only; put any time limit inside the decision itself.
   * @example
   * // Runs all checks at once; the strongest outcome wins.
   * const fastPolicy = credit.combineAll([
   *   affordability,
   *   employment,
   *   bureauScore,
   * ]);
   */
  combineAll<TInput, TContext = unknown>(
    decisions: Decisions<TInput, O, TContext>,
    options?: Override<O> & {
      /** Default: precedence (declaration order). Only `combine` is used. */
      readonly resolver?: Pick<Resolver<O>, "combine">;
    },
  ): Decision<TInput, O, TContext>;

  /**
   * Turns a rule (or any `"passed"`/`"failed"` decision) into a decision of
   * this toolkit: `failed` gives `mapping.failed`, `passed` gives
   * `mapping.passed`, else the last declared outcome. The rule's `error` is
   * dropped. The rule runs without `withSafeError`, so a rule that throws,
   * rejects or returns anything but an object with an own `outcome` of
   * `"passed"` or `"failed"` gives `onError` (the override, else the
   * toolkit's). A `failed` the rule returns always gives `mapping.failed`,
   * including one made upstream from an outage: a default (`"safe"`)
   * `pipeRules` turns a child's throw into `failed` before `mapOutcome` sees
   * it. Map outage-prone rules on their own. The rule must be a
   * function and each mapping value a declared outcome, checked when
   * `mapOutcome` is called (`TypeError` otherwise).
   * Never throws or rejects.
   * @example
   * // A listed applicant is declined; a service outage gives onError ("review").
   * const isNotSanctioned: Rule<CreditApplication> = async (app) =>
   *   (await sanctionsService.isListed(app.applicantId))
   *     ? fail("Applicant is on a sanctions list")
   *     : pass();
   * const sanctions = credit.mapOutcome(isNotSanctioned, {
   *   failed: "declined",
   * });
   */
  mapOutcome<TInput, TContext = unknown>(
    rule: Decision<TInput, "passed" | "failed", TContext>,
    mapping: { readonly failed: O; readonly passed?: O },
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
 * Checks the declared outcomes and returns a frozen copy. Each entry is
 * checked in order, so a duplicate is reported before a later bad entry.
 */
const validateOutcomes = (outcomes: unknown): readonly string[] => {
  const seen = new Set<string>();
  const declared = toList(
    outcomes,
    "defineOutcomes: outcomes",
    (outcome, at) => {
      if (typeof outcome !== "string" || outcome === "") {
        throw new TypeError(`${at} must be a non-empty string`);
      }
      if (seen.has(outcome)) {
        throw new TypeError(
          `defineOutcomes: duplicate outcome ${display(outcome)}`,
        );
      }
      seen.add(outcome);
      return outcome;
    },
  );
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
  const hook: ErrorHook | undefined = options.onErrorCaught;
  if (hook !== undefined && typeof hook !== "function") {
    throw new TypeError(
      "defineOutcomes: options.onErrorCaught must be a function",
    );
  }

  const set: OutcomeSet<O> = { onError, isDeclared };
  const precedence = byPrecedence(declared);

  /** Check for child decisions: an own `outcome` key holding a declared label. */
  const toLabel = (value: unknown): O => {
    if (!isObject(value) || !Object.hasOwn(value, "outcome")) {
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
   * The run side of `combine`/`combineAll`: each child runs through
   * `runDecision` (a failure joins the merge as `fallback`). Only a resolver
   * method throws out of `fold`: it ends the whole combinator with
   * `fallback`, the hook notified once.
   */
  const folding =
    <TInput, TContext, R>(
      children: Decisions<TInput, O, TContext>,
      fold: (
        children: Decisions<TInput, O, TContext>,
        run: (child: Decision<TInput, O, TContext>) => Promise<O>,
        resolver: R,
      ) => Promise<O>,
      resolver: R,
      fallback: O,
    ): Decision<TInput, O, TContext> =>
    async (input, context) => {
      const run = async (child: Decision<TInput, O, TContext>) =>
        (await runDecision(child, input, context, fallback)).outcome;
      try {
        return { outcome: await fold(children, run, resolver) };
      } catch (error) {
        notify(hook, error);
        return { outcome: fallback };
      }
    };

  const toolkit: OutcomeToolkit<O> = {
    outcomes: declared,
    onError,
    outcome: (outcome) => {
      if (!isDeclared(outcome)) throw notDeclared("outcome:", outcome);
      return { outcome };
    },
    ifElse: (predicate, whenTrue, whenFalse, override) => {
      checkFunction(predicate, "ifElse: predicate");
      const yes = toDecision(set, "ifElse: whenTrue", whenTrue);
      const no = toDecision(set, "ifElse: whenFalse", whenFalse);
      const fallback = localOnError(set, "ifElse", override);
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
      checkFunction(accessor, "match: accessor");
      const table = toCaseTable(set, cases);
      const otherwise = toDecision(set, "match: defaultCase", defaultCase);
      const fallback = localOnError(set, "match", override);
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
      const children = toChildren("combine", decisions);
      const resolver = toResolver(set, options?.resolver, precedence);
      const fallback = localOnError(set, "combine", options);
      return folding(children, foldSequential, resolver, fallback);
    },
    combineAll: (decisions, options) => {
      const children = toChildren("combineAll", decisions);
      const resolver = toMerger(set, options?.resolver, precedence);
      const fallback = localOnError(set, "combineAll", options);
      return folding(children, foldParallel, resolver, fallback);
    },
    mapOutcome: (rule, mapping, override) => {
      checkFunction(rule, "mapOutcome: rule");
      const target = toMapping(
        set,
        mapping,
        declared[declared.length - 1] as O,
      );
      const fallback = localOnError(set, "mapOutcome", override);
      return async (input, context) => {
        const source = await runSafely(
          () => rule(input, context),
          toRuleOutcome,
          hook,
        );
        if (!source.ok) return { outcome: fallback };
        return { outcome: target[source.value] };
      };
    },
  };
  return Object.freeze(toolkit);
};

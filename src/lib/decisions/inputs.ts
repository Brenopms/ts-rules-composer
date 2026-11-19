/**
 * Build-time checks: turn a builder's raw arguments into trusted values, or
 * throw a `TypeError` with a fixed message (`<method>: <where> …`). Each user
 * object and property is read once. What runs later needs no checks of its
 * own. See docs/adr/0001-decisions-build-run-pipeline.md. Internal.
 */
import type { Decision, Resolver } from "../types";
import type { Branch, Decisions, Override } from "./define-outcomes";
import { display, expectBoolean, isObject, toList } from "./guards";
import { ignoreRejection } from "./run-safely";

/** What the checks need to know about a toolkit's declared outcomes. */
export interface OutcomeSet<O extends string> {
  /** The toolkit's `onError`. */
  readonly onError: O;
  readonly isDeclared: (value: unknown) => value is O;
}

export const notDeclared = (where: string, value: unknown): TypeError =>
  new TypeError(`${where} ${display(value)} is not a declared outcome`);

/** The combinator's `onError`: its override (validated now), else the toolkit's. */
export const localOnError = <O extends string>(
  set: OutcomeSet<O>,
  combinator: string,
  override?: Override<O>,
): O => {
  const value = override?.onError;
  if (value === undefined) return set.onError;
  if (!set.isDeclared(value)) {
    throw notDeclared(`${combinator}: onError`, value);
  }
  return value;
};

/** A bare-string branch becomes a constant decision, validated now. */
export const toDecision = <O extends string, TInput, TContext>(
  set: OutcomeSet<O>,
  where: string,
  value: Branch<TInput, O, TContext>,
): Decision<TInput, O, TContext> => {
  if (typeof value === "function") return value;
  if (typeof value !== "string") {
    throw new TypeError(
      `${where} must be a declared outcome or a decision function`,
    );
  }
  if (!set.isDeclared(value)) throw notDeclared(where, value);
  return () => ({ outcome: value });
};

/**
 * `match` cases: validates every own case (symbol and non-enumerable keys
 * included) and copies them into a null-prototype table, so later changes
 * to `cases` change nothing.
 */
export const toCaseTable = <O extends string, TInput, TContext>(
  set: OutcomeSet<O>,
  cases: Partial<Record<PropertyKey, Branch<TInput, O, TContext>>>,
): Record<PropertyKey, Decision<TInput, O, TContext>> => {
  if (!isObject(cases)) throw new TypeError("match: cases must be an object");
  const table: Record<
    PropertyKey,
    Decision<TInput, O, TContext>
  > = Object.create(null);
  for (const key of Reflect.ownKeys(cases)) {
    table[key] = toDecision(
      set,
      `match: cases[${display(key)}]`,
      cases[key] as Branch<TInput, O, TContext>,
    );
  }
  return table;
};

/** `combine` children: a non-empty copy holding only decision functions. */
export const toChildren = <O extends string, TInput, TContext>(
  decisions: Decisions<TInput, O, TContext>,
): Decisions<TInput, O, TContext> =>
  toList(decisions, "combine: decisions", (decision, at) => {
    if (typeof decision !== "function") {
      throw new TypeError(`${at} must be a decision function`);
    }
    return decision as Decision<TInput, O, TContext>;
  }) as unknown as Decisions<TInput, O, TContext>;

/** `combine` mode: `"sequential"` (the default) or `"parallel"`. */
export const toMode = (mode: unknown): "sequential" | "parallel" => {
  if (mode === undefined || mode === "sequential") return "sequential";
  if (mode === "parallel") return mode;
  throw new TypeError('combine: mode must be "sequential" or "parallel"');
};

/** A promise is malformed here; its rejection is marked handled. */
const isFinalResult = expectBoolean("resolver.isFinal", {
  onInvalid: ignoreRejection,
});

/**
 * `combine` resolver: `fallback` when none is given. A custom one's methods
 * are read once now and called with the resolver as `this`; each result is
 * checked synchronously when the fold calls it, and a malformed one
 * (including a promise, whose rejection is marked handled) throws a
 * `TypeError` that ends the whole `combine`.
 */
export const toResolver = <O extends string>(
  set: OutcomeSet<O>,
  resolver: Resolver<O> | undefined,
  fallback: Resolver<O>,
): Resolver<O> => {
  if (resolver === undefined) return fallback;
  const combine: unknown = isObject(resolver) ? resolver.combine : undefined;
  const isFinal: unknown =
    typeof combine === "function" ? resolver.isFinal : undefined;
  if (typeof combine !== "function" || typeof isFinal !== "function") {
    throw new TypeError(
      "combine: resolver must be an object with combine and isFinal functions",
    );
  }
  return {
    combine: (current, next) => {
      const merged: unknown = Reflect.apply(combine, resolver, [current, next]);
      if (set.isDeclared(merged)) return merged;
      ignoreRejection(merged);
      throw new TypeError(
        `resolver.combine returned ${display(merged)}, which is not a declared outcome`,
      );
    },
    isFinal: (current) => {
      return isFinalResult(Reflect.apply(isFinal, resolver, [current]));
    },
  };
};

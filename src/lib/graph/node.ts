/**
 * Graph node primitives.
 *
 * This module must not import from `combinators/` or `helpers/`: combinators
 * import it, and `helpers/` and `combinators/` already depend on each other.
 */

/** Any function a combinator may hold as a child (rule, predicate, accessor). */
export type Fn = (...args: never[]) => unknown;

/** A number as a JSON-safe param: `Infinity` and `NaN` would become `null`. */
export const jsonNumber = (value: number): number | string =>
  Number.isFinite(value) ? value : String(value);

/** Behavior a decorator adds around a rule without changing what it checks. */
export type DecoratorName =
  | "timeout"
  | "retry"
  | "memoize"
  | "debug"
  | "tap"
  | "mapError"
  | "lazyContext";

/**
 * Internal mark on a node built by a decision toolkit: its declared outcomes
 * (declaration order), the toolkit's `onError`, and the combinator's own
 * `onError` when it overrides the toolkit's. Never part of {@link GraphNode}.
 */
export type DecisionMarker = {
  outcomes: readonly string[];
  onError: string;
  localOnError?: string;
};

/**
 * Structure recorded by a combinator at construction time. Children are the
 * original functions passed in (before any safety wrapping), so they can be
 * inspected later. Internal: the public, JSON-safe form is {@link GraphNode}.
 */
export type RawNode =
  | {
      /** A rule given an explicit label by `named`. */
      kind: "rule";
      label: string;
      params?: Record<string, unknown>;
      /** Copied by `named` from a toolkit-built node, so it still draws as a decision. */
      decision?: DecisionMarker;
    }
  | {
      kind: "sequence";
      /** Steps in execution order (`composeRules` runs its array reversed). */
      steps: Fn[];
      via: "pipeRules" | "composeRules";
    }
  | {
      kind: "branch";
      /**
       * `when` has only `ifTrue`, `unless` only `ifFalse`, `ifElse` both. A
       * missing side passes. (Not named `then`/`else`: an object with a
       * `then` key is treated as a promise by `await`.)
       */
      test: Fn;
      ifTrue?: Fn;
      ifFalse?: Fn;
      /** Set by a decision toolkit's `ifElse`, which always has both sides. */
      decision?: DecisionMarker;
    }
  | {
      /** A bare-string branch of a decision combinator: the path ends here. */
      kind: "outcome";
      outcome: string;
    }
  | {
      kind: "switch";
      selector: Fn;
      /** Copy of the cases object, keyed as `match` received it. */
      cases: Record<PropertyKey, Fn>;
      /** `match`'s default rule; at most one of `default`/`defaultError`. */
      default?: Fn;
      /** `match`'s default error value, kept raw (never stringified here). */
      defaultError?: unknown;
    }
  | {
      /** `every` is `all` (every rule must pass), `oneOf` is `any`. */
      kind: "all" | "any";
      rules: Fn[];
    }
  | { kind: "not"; rule: Fn }
  | {
      kind: "fallback";
      main: Fn;
      fallback: Fn;
      /** `onlyFallbackOn`: when set, the fallback runs only if it accepts the error. */
      guard?: Fn;
    }
  | {
      kind: "field";
      /** Reads the value the rule is applied to. */
      getter: Fn;
      rule: Fn;
    }
  | {
      kind: "effect";
      /** The side effect `tap` runs; the rule always passes. */
      effect: Fn;
    }
  | {
      kind: "decorator";
      decorator: DecoratorName;
      /** The decorated rule, as passed in. */
      rule: Fn;
      /** Settings worth showing, as plain JSON values. */
      params: Record<string, unknown>;
    };

/** Public, JSON-serializable graph. Built by `toGraph`. */
export type GraphNode =
  | {
      id: string;
      kind: "rule";
      label: string;
      params?: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "sequence";
      via: "pipeRules" | "composeRules";
      steps: GraphNode[];
    }
  | {
      id: string;
      kind: "branch";
      test: string;
      ifTrue?: GraphNode;
      ifFalse?: GraphNode;
    }
  | { id: string; kind: "outcome"; outcome: string }
  | {
      id: string;
      kind: "switch";
      selector: string;
      /** In `Reflect.ownKeys` order; symbol keys appear as `Symbol(desc)`. */
      cases: { key: string; node: GraphNode }[];
      /** Absent `default` and `defaultError` mean "no match" fails. */
      default?: GraphNode;
      defaultError?: string;
    }
  | {
      id: string;
      kind: "all" | "any";
      rules: GraphNode[];
    }
  | { id: string; kind: "not"; rule: GraphNode }
  | {
      id: string;
      kind: "fallback";
      main: GraphNode;
      fallback: GraphNode;
      guard?: string;
    }
  | { id: string; kind: "field"; getter: string; rule: GraphNode }
  | { id: string; kind: "effect"; label: string }
  | {
      id: string;
      kind: "decorator";
      decorator: DecoratorName;
      params: Record<string, unknown>;
      rule: GraphNode;
    };

export type RuleGraph = {
  version: 2;
  root: GraphNode;
  /** Present only when the root was built by a decision combinator. Declaration order. */
  outcomes?: string[];
  /** Present with `outcomes`: the toolkit's onError. */
  onError?: string;
};

/**
 * Registry symbol, so ESM and CJS copies of the package (or several copies of
 * one version) read each other's metadata.
 */
export const NODE_KEY: unique symbol = Symbol.for(
  "ts-rules-composer.node",
) as never;

type WithNode = { [NODE_KEY]?: RawNode };

/**
 * Records `node` on `fn` and returns the same function. The property is
 * non-enumerable, so spreading, `Object.keys` and `JSON.stringify` are
 * unaffected. A later call replaces an earlier one.
 */
export const attachNode = <F extends Fn>(fn: F, node: RawNode): F => {
  Object.defineProperty(fn, NODE_KEY, {
    value: node,
    enumerable: false,
    writable: false,
    configurable: true,
  });
  return fn;
};

/** Returns the node recorded on `fn`, or `undefined` for plain functions. */
export const readNode = (fn: unknown): RawNode | undefined =>
  typeof fn === "function" && Object.hasOwn(fn, NODE_KEY)
    ? (fn as WithNode)[NODE_KEY]
    : undefined;

/** The decision marker on a node, present only when a toolkit built it (or `named` copied it). */
export const markerOf = (
  raw: RawNode | undefined,
): DecisionMarker | undefined =>
  raw && "decision" in raw ? raw.decision : undefined;

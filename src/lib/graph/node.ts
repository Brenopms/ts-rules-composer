/**
 * Graph node primitives.
 *
 * This module must not import from `combinators/` or `helpers/`: combinators
 * import it, and `helpers/` and `combinators/` already depend on each other.
 */

/** Any function a combinator may hold as a child (rule, predicate, accessor). */
export type Fn = (...args: never[]) => unknown;

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
    };

export type RuleGraph = { version: 1; root: GraphNode };

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

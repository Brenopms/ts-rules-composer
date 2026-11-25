import type { Rule } from "../types";
import { usableName } from "./labels";
import { type Fn, type GraphNode, type RuleGraph, readNode } from "./node";

/**
 * Builds the public graph. Unlabelled functions get `rule #n`, numbered in
 * depth-first order (a branch's predicate before its sides) so that the same
 * pipeline always yields the same labels.
 */
const createBuilder = () => {
  let unlabelled = 0;
  const labelOf = (fn: Fn, explicit?: string) =>
    explicit ?? usableName(fn) ?? `rule #${++unlabelled}`;

  /**
   * `hint` is a label offered by an enclosing `withDebug`: it names a leaf
   * rule that has no explicit label, ahead of the function's own name.
   */
  const build = (fn: Fn, id: string, hint?: string): GraphNode => {
    const raw = readNode(fn);

    // Any function without a recorded structure is a leaf rule.
    if (!raw || raw.kind === "rule") {
      return {
        id,
        kind: "rule",
        label: labelOf(fn, raw?.label ?? hint),
        ...(raw?.params ? { params: { ...raw.params } } : {}),
      };
    }

    switch (raw.kind) {
      case "sequence":
        return {
          id,
          kind: "sequence",
          via: raw.via,
          steps: raw.steps.map((step, index) =>
            build(step, `${id}.steps.${index}`),
          ),
        };
      case "branch": {
        const test = labelOf(raw.test, readLabel(raw.test));
        return {
          id,
          kind: "branch",
          test,
          ...(raw.ifTrue ? { ifTrue: build(raw.ifTrue, `${id}.ifTrue`) } : {}),
          ...(raw.ifFalse
            ? { ifFalse: build(raw.ifFalse, `${id}.ifFalse`) }
            : {}),
        };
      }
      case "all":
      case "any":
        return {
          id,
          kind: raw.kind,
          rules: raw.rules.map((rule, index) =>
            build(rule, `${id}.rules.${index}`),
          ),
        };
      case "not":
        return { id, kind: "not", rule: build(raw.rule, `${id}.rule`) };
      case "fallback": {
        // Numbered in execution order: main, then the guard, then the fallback.
        const main = build(raw.main, `${id}.main`);
        const guard = raw.guard && labelOf(raw.guard, readLabel(raw.guard));
        return {
          id,
          kind: "fallback",
          main,
          ...(guard ? { guard } : {}),
          fallback: build(raw.fallback, `${id}.fallback`),
        };
      }
      case "field": {
        const getter = labelOf(raw.getter, readLabel(raw.getter));
        return {
          id,
          kind: "field",
          getter,
          rule: build(raw.rule, `${id}.rule`),
        };
      }
      case "effect":
        return {
          id,
          kind: "effect",
          label: labelOf(raw.effect, readLabel(raw.effect)),
        };
      case "decorator": {
        const debugName =
          raw.decorator === "debug" ? raw.params.name : undefined;
        return {
          id,
          kind: "decorator",
          decorator: raw.decorator,
          params: { ...raw.params },
          rule: build(
            raw.rule,
            `${id}.rule`,
            typeof debugName === "string" ? debugName : hint,
          ),
        };
      }
      case "switch": {
        const selector = labelOf(raw.selector, readLabel(raw.selector));
        return {
          id,
          kind: "switch",
          selector,
          cases: Reflect.ownKeys(raw.cases).map((key, index) => ({
            key: String(key),
            node: build(raw.cases[key] as Fn, `${id}.cases.${index}`),
          })),
          ...(raw.default
            ? { default: build(raw.default, `${id}.default`) }
            : {}),
          ...(raw.defaultError === undefined
            ? {}
            : { defaultError: describeError(raw.defaultError) }),
        };
      }
      // The node key is shared, so another version of this package could have
      // attached a kind this one does not know: describe it as a leaf.
      default:
        return { id, kind: "rule", label: labelOf(fn, hint) };
    }
  };

  return build;
};

/** Strings are shown as-is; anything else is never stringified (it could run user code). */
const describeError = (error: unknown) =>
  typeof error === "string" ? error : "custom error";

const readLabel = (fn: Fn) => {
  const raw = readNode(fn);
  return raw?.kind === "rule" ? raw.label : undefined;
};

/**
 * Describes a rule as a JSON-serializable graph, without running it.
 *
 * Rules built with this package's combinators are described structurally; any
 * other function (including your own wrappers) is a single leaf rule.
 *
 * @example
 * const graph = toGraph(pipeRules([hasItems, withinLimit]));
 * // { version: 1, root: { kind: "sequence", steps: [...] } }
 * @caveats
 * - Nothing is executed: rules, predicates and accessors are never called.
 * - Anonymous functions are labelled `rule #n`; use `named` for a real name.
 */
export const toGraph = <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
): RuleGraph => ({ version: 1, root: createBuilder()(rule, "root") });

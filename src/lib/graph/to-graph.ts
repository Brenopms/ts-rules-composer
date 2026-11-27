import type { Decision, Rule } from "../types";
import { usableName } from "./labels";
import {
  type DecisionMarker,
  type Fn,
  type GraphNode,
  type RawNode,
  type RuleGraph,
  readNode,
} from "./node";

/**
 * What an unlabelled leaf is called (a side of a toolkit node is a decision),
 * and which kind of diagram the root makes.
 */
type Role = "rule" | "decision";

const markerOf = (raw: RawNode): DecisionMarker | undefined =>
  "decision" in raw ? raw.decision : undefined;

/**
 * Builds the public graph. Unlabelled functions get `rule #n` (`decision #n`
 * as a side of a toolkit node), numbered in depth-first order (a branch's
 * predicate before its sides) so that the same pipeline always yields the
 * same labels. Also collects the ids of toolkit-built nodes.
 */
const createBuilder = (mode: Role) => {
  let unlabelled = 0;
  const decisionIds = new Set<string>();
  const labelOf = (fn: Fn, explicit?: string, role: Role = "rule") =>
    explicit ?? usableName(fn) ?? `${role} #${++unlabelled}`;

  /**
   * `hint` is a label offered by an enclosing `withDebug`: it names a leaf
   * rule that has no explicit label, ahead of the function's own name.
   */
  const build = (
    fn: Fn,
    id: string,
    hint?: string,
    role: Role = "rule",
  ): GraphNode => {
    const raw = readNode(fn);
    const named = raw?.kind === "rule" ? raw : undefined;

    // Any function without a recorded structure is a leaf rule. So is a
    // toolkit-built node inside a rule graph: rule diagrams stay as they were.
    if (!raw || named || (mode === "rule" && markerOf(raw))) {
      return {
        id,
        kind: "rule",
        label: labelOf(fn, named?.label ?? hint, role),
        ...(named?.params ? { params: { ...named.params } } : {}),
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
        const side = sideRole(raw.decision);
        if (raw.decision) {
          decisionIds.add(id);
        }
        return {
          id,
          kind: "branch",
          test,
          ...(raw.ifTrue
            ? { ifTrue: build(raw.ifTrue, `${id}.ifTrue`, undefined, side) }
            : {}),
          ...(raw.ifFalse
            ? { ifFalse: build(raw.ifFalse, `${id}.ifFalse`, undefined, side) }
            : {}),
        };
      }
      case "outcome":
        return { id, kind: "outcome", outcome: raw.outcome };
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
            role,
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
        return { id, kind: "rule", label: labelOf(fn, hint, role) };
    }
  };

  return { build, decisionIds };
};

const sideRole = (marker: DecisionMarker | undefined): Role =>
  marker ? "decision" : "rule";

/** The root's decision marker: present only for a toolkit-built root. */
const rootMarker = (fn: Fn) => {
  const raw = readNode(fn);
  return raw && markerOf(raw);
};

/**
 * The public graph plus the ids of toolkit-built nodes, which the printer
 * needs to draw a toolkit node apart from a rule node of the same shape.
 * Internal: not exported from the package.
 */
export const buildGraph = (
  fn: Fn,
): { graph: RuleGraph; decisionIds: ReadonlySet<string> } => {
  const marker = rootMarker(fn);
  const { build, decisionIds } = createBuilder(marker ? "decision" : "rule");
  const root = build(fn, "root");
  const outcomes = marker
    ? { outcomes: [...marker.outcomes], onError: marker.onError }
    : {};
  return { graph: { version: 2, root, ...outcomes }, decisionIds };
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
 * // { version: 2, root: { kind: "sequence", steps: [...] } }
 * @caveats
 * - Nothing is executed: rules, predicates and accessors are never called.
 * - Anonymous functions are labelled `rule #n`; use `named` for a real name.
 */
export function toGraph<TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
): RuleGraph;
/**
 * Describes a decision as a JSON-serializable graph, without running it.
 *
 * @example
 * const graph = toGraph(credit.ifElse(isHighRisk, declined, approved));
 * @caveats
 * - Nothing is executed: decisions, predicates and selectors are never called.
 */
export function toGraph<TInput, O extends string, TContext>(
  decision: Decision<TInput, O, TContext>,
): RuleGraph;
export function toGraph(fn: Fn): RuleGraph {
  return buildGraph(fn).graph;
}

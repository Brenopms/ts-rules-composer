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

  const build = (fn: Fn, id: string): GraphNode => {
    const raw = readNode(fn);

    // Any function without a recorded structure is a leaf rule.
    if (!raw || raw.kind === "rule") {
      return {
        id,
        kind: "rule",
        label: labelOf(fn, raw?.label),
        ...(raw?.params ? { params: raw.params } : {}),
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
    }
  };

  return build;
};

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

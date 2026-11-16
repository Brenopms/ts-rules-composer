import type { GraphNode } from "../graph/node";
import { toGraph } from "../graph/to-graph";
import type { Rule } from "../types";

/** A point control leaves a fragment from, with an optional edge label. */
type Port = { id: string; label?: string };

/**
 * A drawn piece of the diagram. `exits` continue to whatever comes next when the
 * piece passes; `fails` are where it can fail, left for the parent to route
 * (to `failed`, or to a fallback).
 */
type Fragment = {
  nodes: string[];
  edges: string[];
  entry: string;
  exits: Port[];
  fails: Port[];
};

const mermaidId = (id: string) => id.replace(/[^A-Za-z0-9_]/g, "_");

/**
 * Labels come from function names and `named()` strings, so they are
 * untrusted. Everything except letters, digits, spaces and a few plain
 * punctuation marks becomes a numeric entity (`#40;`). That covers quotes,
 * brackets, `%` (directives), `#`, `;` and every kind of line break, so a label
 * can never leave its quoted string or start a statement of its own.
 */
const escapeLabel = (label: string) =>
  label.replace(/[^\p{L}\p{N} _.,:/-]/gu, (char) => `#${char.codePointAt(0)};`);

const box = (id: string, label: string) => `  ${id}["${escapeLabel(label)}"]`;

const link = (
  from: Port,
  to: string,
  arrow = "-->",
  fallbackLabel?: string,
) => {
  const label = from.label ?? fallbackLabel;
  return label === undefined
    ? `  ${from.id} ${arrow} ${to}`
    : `  ${from.id} ${arrow}|"${escapeLabel(label)}"| ${to}`;
};

const linkAll = (from: Port[], to: string, arrow = "-->", label?: string) =>
  from.map((port) => link(port, to, arrow, label));

const group = (id: string, title: string, nodes: string[]) => [
  `  subgraph ${id}_sg["${escapeLabel(title)}"]`,
  ...nodes,
  "  end",
];

const fragment = (parts: Partial<Fragment> & { entry: string }): Fragment => ({
  nodes: [],
  edges: [],
  exits: [],
  fails: [],
  ...parts,
});

/** Draws the rule at `id` plus whichever children it has, in order. */
const render = (node: GraphNode): Fragment => {
  const id = mermaidId(node.id);

  switch (node.kind) {
    case "sequence": {
      if (node.steps.length === 0) break;
      const parts = node.steps.map(render);
      return fragment({
        nodes: parts.flatMap((part) => part.nodes),
        edges: [
          ...parts.flatMap((part) => part.edges),
          ...parts
            .slice(1)
            .flatMap((part, i) => linkAll(parts[i].exits, part.entry)),
        ],
        entry: parts[0].entry,
        exits: parts[parts.length - 1].exits,
        fails: parts.flatMap((part) => part.fails),
      });
    }
    case "branch": {
      const sides = [
        { child: node.ifTrue, label: "yes" },
        { child: node.ifFalse, label: "no" },
      ].map(({ child, label }) => ({
        label,
        part: child && render(child),
      }));
      return fragment({
        nodes: [
          `  ${id}{"${escapeLabel(node.test)}"}`,
          ...sides.flatMap(({ part }) => part?.nodes ?? []),
        ],
        edges: sides.flatMap(({ part, label }) => [
          ...(part ? [link({ id, label }, part.entry)] : []),
          ...(part?.edges ?? []),
        ]),
        entry: id,
        exits: sides.flatMap(
          ({ part, label }) => part?.exits ?? [{ id, label }],
        ),
        fails: sides.flatMap(({ part }) => part?.fails ?? []),
      });
    }
    case "switch": {
      const cases = node.cases.map(({ key, node: child }) => ({
        label: key,
        part: render(child),
      }));
      const fallback = node.default && {
        label: "default",
        part: render(node.default),
      };
      const routed = fallback ? [...cases, fallback] : cases;
      return fragment({
        nodes: [
          `  ${id}{"${escapeLabel(node.selector)}"}`,
          ...routed.flatMap(({ part }) => part.nodes),
        ],
        edges: routed.flatMap(({ part, label }) => [
          link({ id, label }, part.entry),
          ...part.edges,
        ]),
        entry: id,
        exits: routed.flatMap(({ part }) => part.exits),
        fails: [
          ...routed.flatMap(({ part }) => part.fails),
          ...(fallback
            ? []
            : [
                {
                  id,
                  label:
                    node.defaultError === undefined ? "no match" : "default",
                },
              ]),
        ],
      });
    }
    case "all":
    case "any": {
      const parts = node.rules.map(render);
      const fork = `${id}_in`;
      const join = `${id}_out`;
      const title =
        node.kind === "all" ? "all must pass" : "at least one must pass";
      return fragment({
        nodes: group(id, title, [
          `  ${fork}(("fork"))`,
          ...parts.flatMap((part) => part.nodes),
          `  ${join}(("join"))`,
        ]),
        edges: [
          ...(parts.length === 0 ? [`  ${fork} --> ${join}`] : []),
          ...parts.flatMap((part) => [
            `  ${fork} --> ${part.entry}`,
            ...part.edges,
            ...linkAll(part.exits, join),
          ]),
        ],
        entry: fork,
        exits: [{ id: join }],
        fails: [{ id: join }],
      });
    }
    case "not": {
      const part = render(node.rule);
      const gate = `${id}_gate`;
      return fragment({
        nodes: [...group(id, "not", part.nodes), `  ${gate}{"inner passed?"}`],
        edges: [...part.edges, ...linkAll(part.exits, gate)],
        entry: part.entry,
        exits: [{ id: gate, label: "no" }],
        fails: [{ id: gate, label: "yes" }],
      });
    }
    case "fallback": {
      const main = render(node.main);
      const fallback = render(node.fallback);
      const onFail = node.guard ? `on fail if ${node.guard}` : "on fail";
      return fragment({
        nodes: [...main.nodes, ...fallback.nodes],
        edges: [
          ...main.edges,
          ...fallback.edges,
          ...linkAll(main.fails, fallback.entry, "-.->", onFail),
        ],
        entry: main.entry,
        exits: [...main.exits, ...fallback.exits],
        // A guard that rejects the error lets the main failure through.
        fails: [...(node.guard ? main.fails : []), ...fallback.fails],
      });
    }
    case "field": {
      const part = render(node.rule);
      return fragment({
        ...part,
        nodes: group(id, `field: ${node.getter}`, part.nodes),
      });
    }
    case "effect":
      return fragment({
        nodes: [`  ${id}("${escapeLabel(node.label)}")`],
        entry: id,
        exits: [{ id }],
      });
    case "decorator":
      // Badges come later; until then a decorator is drawn as the rule it wraps.
      return render(node.rule);
  }

  // Leaves, and anything without a shape of its own, are a single box.
  const label = node.kind === "rule" ? node.label : node.kind;
  return fragment({
    nodes: [box(id, label)],
    entry: id,
    exits: [{ id }],
    fails: [{ id }],
  });
};

/**
 * Renders a rule as Mermaid flowchart source, without running it.
 *
 * Draws every node kind; decorators are drawn as the rule they wrap for now.
 *
 * @example
 * const text = toMermaid(pipeRules([hasItems, withinLimit]));
 */
export const toMermaid = <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
): string => {
  const body = render(toGraph(rule).root);
  return [
    "flowchart TD",
    "  input([input])",
    ...body.nodes,
    "  passed([passed])",
    ...(body.fails.length > 0 ? ["  failed([failed])"] : []),
    `  input --> ${body.entry}`,
    ...body.edges,
    ...linkAll(body.exits, "passed"),
    ...linkAll(body.fails, "failed", "-.->", "fail"),
  ].join("\n");
};

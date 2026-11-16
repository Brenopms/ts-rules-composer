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

export type MermaidOptions = {
  /** Flow direction. Default `"TD"`. */
  direction?: "TD" | "LR";
  /** Draw dotted edges from steps that can fail to `failed`. Default `true`. */
  failEdges?: boolean;
  /** Also show `withDebug`, `withTap` and `mapError` decorators. Default `false`. */
  verbose?: boolean;
  /** Longest label text, cut with `…`. Default `40`. Badges are never cut. */
  maxLabelLength?: number;
};

type Settings = { verbose: boolean; max: number };

const clip = (max: number, text: string) => {
  const chars = [...text];
  return chars.length > max
    ? `${chars.slice(0, Math.max(1, max - 1)).join("")}…`
    : text;
};

/** Short text for a decorator, or `undefined` when it stays hidden. */
const badge = (
  node: Extract<GraphNode, { kind: "decorator" }>,
  verbose: boolean,
) => {
  switch (node.decorator) {
    case "timeout":
      return `⏱ ${node.params.ms}ms`;
    case "retry":
      return `↻ ${node.params.attempts}x`;
    case "memoize":
      return "⚡ cached";
    default:
      return verbose ? node.decorator : undefined;
  }
};

const withBadges = (label: string, badges: string[]) =>
  [label, ...badges].join(" ");

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
const render = (
  node: GraphNode,
  cfg: Settings,
  badges: string[] = [],
): Fragment => {
  if (node.kind === "decorator") {
    const own = badge(node, cfg.verbose);
    return render(node.rule, cfg, own ? [...badges, own] : badges);
  }
  const part = draw(node, cfg, badges);
  return badges.length > 0 && !isLeaf(node)
    ? {
        ...part,
        nodes: group(
          `${mermaidId(node.id)}_badge`,
          badges.join(" "),
          part.nodes,
        ),
      }
    : part;
};

const isLeaf = (node: GraphNode) =>
  node.kind === "rule" || node.kind === "effect" || !composite.has(node.kind);

const composite = new Set<string>([
  "sequence",
  "branch",
  "switch",
  "all",
  "any",
  "not",
  "fallback",
  "field",
]);

const draw = (
  node: Exclude<GraphNode, { kind: "decorator" }>,
  cfg: Settings,
  badges: string[],
): Fragment => {
  const id = mermaidId(node.id);
  const text = (value: string) => clip(cfg.max, value);
  const sub = (child: GraphNode) => render(child, cfg);

  switch (node.kind) {
    case "sequence": {
      if (node.steps.length === 0) {
        return fragment({
          nodes: [`  ${id}("no rules")`],
          entry: id,
          exits: [{ id }],
        });
      }
      const parts = node.steps.map(sub);
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
        part: child && sub(child),
      }));
      return fragment({
        nodes: [
          `  ${id}{"${escapeLabel(text(node.test))}"}`,
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
        label: text(key),
        part: sub(child),
      }));
      const fallback = node.default && {
        label: "default",
        part: sub(node.default),
      };
      const routed = fallback ? [...cases, fallback] : cases;
      return fragment({
        nodes: [
          `  ${id}{"${escapeLabel(text(node.selector))}"}`,
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
      const parts = node.rules.map(sub);
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
        fails: parts.length === 0 ? [] : [{ id: join }],
      });
    }
    case "not": {
      const part = sub(node.rule);
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
      const main = sub(node.main);
      const fallback = sub(node.fallback);
      const onFail = node.guard ? `on fail if ${text(node.guard)}` : "on fail";
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
      const part = sub(node.rule);
      return fragment({
        ...part,
        nodes: group(id, `field: ${text(node.getter)}`, part.nodes),
      });
    }
    case "effect":
      return fragment({
        nodes: [
          `  ${id}("${escapeLabel(withBadges(text(node.label), badges))}")`,
        ],
        entry: id,
        exits: [{ id }],
      });
  }

  // Every other kind was drawn above, so this is a leaf rule.
  return fragment({
    nodes: [box(id, withBadges(text(node.label), badges))],
    entry: id,
    exits: [{ id }],
    fails: [{ id }],
  });
};

/**
 * Renders a rule as Mermaid flowchart source, without running it.
 *
 * Draws every node kind. Timeout, retry and memoize show as badges on the
 * wrapped rule; debug, tap and mapError only with `verbose`.
 *
 * @example
 * const text = toMermaid(pipeRules([hasItems, withinLimit]));
 */
export const toMermaid = <TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
  options: MermaidOptions = {},
): string => {
  const {
    direction = "TD",
    failEdges = true,
    verbose = false,
    maxLabelLength = 40,
  } = options;
  const body = render(toGraph(rule).root, { verbose, max: maxLabelLength });
  const fails = failEdges ? body.fails : [];
  return [
    `flowchart ${direction}`,
    "  input([input])",
    ...body.nodes,
    "  passed([passed])",
    ...(fails.length > 0 ? ["  failed([failed])"] : []),
    `  input --> ${body.entry}`,
    ...body.edges,
    ...linkAll(body.exits, "passed"),
    ...linkAll(fails, "failed", "-.->", "fail"),
  ].join("\n");
};

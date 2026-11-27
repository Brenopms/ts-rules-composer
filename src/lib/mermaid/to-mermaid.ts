import type { GraphNode, RuleGraph } from "../graph/node";
import { buildGraph } from "../graph/to-graph";
import type { Decision, Rule } from "../types";

/**
 * A point control leaves a fragment from, with an optional edge label.
 * `ends` marks a decision outcome: the path stops there.
 */
type Port = { id: string; label?: string; ends?: true };

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
  /** Draw dotted edges from steps that can fail to `failed`. Default `false`: they roughly double the edges and bury the happy path. */
  failEdges?: boolean;
  /** Also show `withDebug`, `withTap` and `mapError` decorators. Default `false`. */
  verbose?: boolean;
  /** Longest label text, cut with `…`. Default `40`. Badges are never cut. */
  maxLabelLength?: number;
};

type RenderSettings = { verbose: boolean; maxLabelLength: number };

/** At least 2, so a label keeps one character before its `…`. */
const labelLimit = (requested: number) =>
  Number.isNaN(requested) ? 40 : Math.max(2, Math.floor(requested));

const clip = (maxLabelLength: number, text: string) => {
  const chars = [...text];
  return chars.length > maxLabelLength
    ? `${chars.slice(0, maxLabelLength - 1).join("")}…`
    : text;
};

const direction = (requested: string) => (requested === "LR" ? "LR" : "TD");

const param = (value: unknown) =>
  typeof value === "number" || typeof value === "string" ? `${value}` : "?";

/** Short text for a decorator, or `undefined` when it stays hidden. */
const badge = (
  node: Extract<GraphNode, { kind: "decorator" }>,
  verbose: boolean,
) => {
  switch (node.decorator) {
    case "timeout":
      return `⏱ ${param(node.params.ms)}ms`;
    case "retry":
      return `↻ ${param(node.params.attempts)}x`;
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

const isLeaf = (node: GraphNode) => !composite.has(node.kind);

/** Draws the rule at `id` plus whichever children it has, in order. */
const render = (
  node: GraphNode,
  settings: RenderSettings,
  badges: string[] = [],
): Fragment => {
  if (node.kind === "decorator") {
    const own = badge(node, settings.verbose);
    return render(node.rule, settings, own ? [...badges, own] : badges);
  }
  const part = draw(node, settings, badges);
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

/** What every `draw*` function needs besides its node. */
type Ctx = {
  id: string;
  badges: string[];
  /** A label cut to `maxLabelLength`. */
  text: (value: string) => string;
  /** Draws a child rule. */
  sub: (child: GraphNode) => Fragment;
};

type NodeOf<K extends GraphNode["kind"]> = Extract<GraphNode, { kind: K }>;

const drawSequence = (node: NodeOf<"sequence">, { id, sub }: Ctx): Fragment => {
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
};

const drawBranch = (
  node: NodeOf<"branch">,
  { id, text, sub }: Ctx,
): Fragment => {
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
    exits: sides.flatMap(({ part, label }) => part?.exits ?? [{ id, label }]),
    fails: sides.flatMap(({ part }) => part?.fails ?? []),
  });
};

const drawSwitch = (
  node: NodeOf<"switch">,
  { id, text, sub }: Ctx,
): Fragment => {
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
              label: node.defaultError === undefined ? "no match" : "default",
            },
          ]),
    ],
  });
};

/** `every` and `oneOf`: a fork and a join around the child rules. */
const drawFork = (node: NodeOf<"all" | "any">, { id, sub }: Ctx): Fragment => {
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
};

const drawNot = (node: NodeOf<"not">, { id, sub }: Ctx): Fragment => {
  const part = sub(node.rule);
  const gate = `${id}_gate`;
  return fragment({
    nodes: [...group(id, "not", part.nodes), `  ${gate}{"inner failed?"}`],
    edges: [...part.edges, ...linkAll(part.exits, gate)],
    entry: part.entry,
    // `not` passes when the inner rule fails, so the happy edge reads "yes".
    exits: [{ id: gate, label: "yes" }],
    fails: [{ id: gate, label: "no" }],
  });
};

const drawFallback = (
  node: NodeOf<"fallback">,
  { text, sub }: Ctx,
): Fragment => {
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
};

const drawField = (node: NodeOf<"field">, { id, text, sub }: Ctx): Fragment => {
  const part = sub(node.rule);
  return fragment({
    ...part,
    nodes: group(id, `field: ${text(node.getter)}`, part.nodes),
  });
};

const drawEffect = (
  node: NodeOf<"effect">,
  { id, text, badges }: Ctx,
): Fragment =>
  fragment({
    nodes: [`  ${id}("${escapeLabel(withBadges(text(node.label), badges))}")`],
    entry: id,
    exits: [{ id }],
  });

/** A decision outcome: a stadium that ends its path. */
const drawOutcome = (node: NodeOf<"outcome">, { id, text }: Ctx): Fragment =>
  fragment({
    nodes: [`  ${id}(["${escapeLabel(text(node.outcome))}"])`],
    entry: id,
    exits: [{ id, ends: true }],
  });

const drawLeaf = (node: NodeOf<"rule">, { id, text, badges }: Ctx): Fragment =>
  fragment({
    nodes: [box(id, withBadges(text(node.label), badges))],
    entry: id,
    exits: [{ id }],
    fails: [{ id }],
  });

const draw = (
  node: Exclude<GraphNode, { kind: "decorator" }>,
  settings: RenderSettings,
  badges: string[],
): Fragment => {
  const ctx: Ctx = {
    id: mermaidId(node.id),
    badges,
    text: (value) => clip(settings.maxLabelLength, value),
    sub: (child) => render(child, settings),
  };

  switch (node.kind) {
    case "sequence":
      return drawSequence(node, ctx);
    case "branch":
      return drawBranch(node, ctx);
    case "switch":
      return drawSwitch(node, ctx);
    case "all":
    case "any":
      return drawFork(node, ctx);
    case "not":
      return drawNot(node, ctx);
    case "fallback":
      return drawFallback(node, ctx);
    case "field":
      return drawField(node, ctx);
    case "effect":
      return drawEffect(node, ctx);
    case "outcome":
      return drawOutcome(node, ctx);
    default:
      // Every other kind is a leaf rule, including kinds this printer does not know.
      return drawLeaf(node, ctx);
  }
};

/**
 * Renders a rule as Mermaid flowchart source, without running it.
 *
 * Draws every node kind. Timeout, retry and memoize show as badges on the
 * wrapped rule; debug, tap and mapError only with `verbose`.
 *
 * @example
 * const text = toMermaid(pipeRules([hasItems, withinLimit]), {
 *   direction: "LR",
 *   failEdges: true,
 * });
 * @caveats
 * - Nothing is executed: rules, predicates and accessors are never called.
 * - Anonymous functions print as `rule #n`; use `named` for a real name.
 * - `failEdges` defaults to `false`; pass `true` for dotted edges to `failed`.
 */
export function toMermaid<TInput, TError, TContext>(
  rule: Rule<TInput, TError, TContext>,
  options?: MermaidOptions,
): string;
/**
 * Renders a decision as Mermaid flowchart source, without running it.
 *
 * @example
 * const text = toMermaid(credit.ifElse(isHighRisk, declined, approved));
 * @caveats
 * - Nothing is executed: decisions, predicates and selectors are never called.
 */
export function toMermaid<TInput, O extends string, TContext>(
  decision: Decision<TInput, O, TContext>,
  options?: MermaidOptions,
): string;
// Every Rule is also a Decision over "passed" | "failed", so one parameter type covers both.
export function toMermaid(
  fn: Decision<unknown, string, unknown>,
  options: MermaidOptions = {},
): string {
  const {
    direction: requestedDirection = "TD",
    failEdges = false,
    verbose = false,
    maxLabelLength = 40,
  } = options;
  const settings = { verbose, maxLabelLength: labelLimit(maxLabelLength) };
  const { graph } = buildGraph(fn);
  const body = render(graph.root, settings);
  const { nodes, edges } = graph.outcomes
    ? decisionEnds(body, graph.outcomes, settings)
    : ruleEnds(body, failEdges);
  return [
    `flowchart ${direction(requestedDirection)}`,
    "  input([input])",
    ...body.nodes,
    ...nodes,
    `  input --> ${body.entry}`,
    ...body.edges,
    ...edges,
  ].join("\n");
}

type Ends = { nodes: string[]; edges: string[] };

/** Rule diagram: exits go to `passed`; fail ports to `failed` only with `failEdges`. */
const ruleEnds = (body: Fragment, failEdges: boolean): Ends => {
  const fails = failEdges ? body.fails : [];
  return {
    nodes: [
      "  passed([passed])",
      ...(fails.length > 0 ? ["  failed([failed])"] : []),
    ],
    edges: [
      ...linkAll(body.exits, "passed"),
      ...linkAll(fails, "failed", "-.->", "fail"),
    ],
  };
};

/**
 * Decision diagram: outcome stadiums already end their path. Any other exit
 * goes to one terminal naming the declared outcome set. Decisions never fail,
 * so fail ports are not drawn.
 */
const decisionEnds = (
  body: Fragment,
  outcomes: NonNullable<RuleGraph["outcomes"]>,
  settings: RenderSettings,
): Ends => {
  const open = body.exits.filter((port) => !port.ends);
  // Every path already ends at an outcome: no terminal, so no label to build.
  if (open.length === 0) {
    return { nodes: [], edges: [] };
  }
  const label = clip(settings.maxLabelLength, outcomes.join(" / "));
  return {
    nodes: [`  outcome(["${escapeLabel(label)}"])`],
    edges: linkAll(open, "outcome"),
  };
};

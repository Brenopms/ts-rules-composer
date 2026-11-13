import type { GraphNode } from "../graph/node";
import { toGraph } from "../graph/to-graph";
import type { Rule } from "../types";

type Fragment = {
  nodes: string[];
  edges: string[];
  entry: string;
  exit: string;
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

const render = (node: GraphNode): Fragment => {
  const id = mermaidId(node.id);

  if (node.kind === "sequence" && node.steps.length > 0) {
    const parts = node.steps.map(render);
    return {
      nodes: parts.flatMap((part) => part.nodes),
      edges: [
        ...parts.flatMap((part) => part.edges),
        ...parts
          .slice(1)
          .map((part, i) => `  ${parts[i].exit} --> ${part.entry}`),
      ],
      entry: parts[0].entry,
      exit: parts[parts.length - 1].exit,
    };
  }

  // Leaves and kinds the skeleton cannot draw yet render as a single box.
  const label = node.kind === "rule" ? node.label : node.kind;
  return { nodes: [box(id, label)], edges: [], entry: id, exit: id };
};

/**
 * Renders a rule as Mermaid flowchart source, without running it.
 *
 * Skeleton: draws leaf rules and `pipeRules` sequences only.
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
    `  input --> ${body.entry}`,
    ...body.edges,
    `  ${body.exit} --> passed`,
  ].join("\n");
};

import { describe, expect, it, vi } from "vitest";

import { fail, pass, pipeRules, type Rule, toGraph, when } from "../index";
import { readNode } from "./node";

type Order = { items: number; total: number };

const hasItems: Rule<Order> = (order) =>
  order.items > 0 ? pass() : fail("Cart is empty");
const withinLimit: Rule<Order> = (order) =>
  order.total <= 1000 ? pass() : fail("Over the limit");
const isLarge = (order: Order) => order.total > 500;

describe("toGraph", () => {
  it("describes a plain function as a leaf labelled by its name", () => {
    expect(toGraph(hasItems)).toEqual({
      version: 1,
      root: { id: "root", kind: "rule", label: "hasItems" },
    });
  });

  it("describes pipeRules as a sequence with position-based ids", () => {
    const pipeline = pipeRules<Order>([hasItems, withinLimit]);

    expect(toGraph(pipeline).root).toEqual({
      id: "root",
      kind: "sequence",
      via: "pipeRules",
      steps: [
        { id: "root.steps.0", kind: "rule", label: "hasItems" },
        { id: "root.steps.1", kind: "rule", label: "withinLimit" },
      ],
    });
  });

  it("describes when as a branch with only a true side", () => {
    const rule = when<Order>(isLarge, withinLimit);

    expect(toGraph(rule).root).toEqual({
      id: "root",
      kind: "branch",
      test: "isLarge",
      ifTrue: { id: "root.ifTrue", kind: "rule", label: "withinLimit" },
    });
  });

  it("describes nested combinators", () => {
    const pipeline = pipeRules<Order>([
      hasItems,
      when<Order>(isLarge, pipeRules<Order>([withinLimit])),
    ]);

    const [first, second] = (
      toGraph(pipeline).root as { steps: { id: string; kind: string }[] }
    ).steps;

    expect(first).toMatchObject({ id: "root.steps.0", kind: "rule" });
    expect(second).toMatchObject({ id: "root.steps.1", kind: "branch" });
  });

  it("is deterministic", () => {
    const pipeline = pipeRules<Order>([
      hasItems,
      when<Order>(isLarge, withinLimit),
    ]);

    expect(toGraph(pipeline)).toEqual(toGraph(pipeline));
  });

  it("produces plain JSON", () => {
    const graph = toGraph(
      pipeRules<Order>([hasItems, when<Order>(isLarge, withinLimit)]),
    );

    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
  });

  it("never invokes rules or predicates", () => {
    const rule = vi.fn(() => pass());
    const predicate = vi.fn(() => true);
    const pipeline = pipeRules<Order>([rule, when<Order>(predicate, rule)]);

    toGraph(pipeline);

    expect(rule).not.toHaveBeenCalled();
    expect(predicate).not.toHaveBeenCalled();
  });
});

describe("node capture keeps the original children", () => {
  // Combinators wrap children with withSafeError, so reading the nodes back
  // must still give the functions the caller passed in.
  it.each([
    ["default (safe) mode", {}],
    ["unsafe mode", { errorHandlingMode: "unsafe" as const }],
  ])("pipeRules, %s", (_name, options) => {
    const pipeline = pipeRules<Order>([hasItems, withinLimit], options);
    const node = readNode(pipeline);

    expect(node).toMatchObject({ kind: "sequence", via: "pipeRules" });
    expect(node?.kind === "sequence" && node.steps[0]).toBe(hasItems);
    expect(node?.kind === "sequence" && node.steps[1]).toBe(withinLimit);
  });

  it.each([
    ["default (safe) mode", undefined],
    ["unsafe mode", { errorHandlingMode: "unsafe" as const }],
  ])("when, %s", (_name, options) => {
    const rule = when<Order>(isLarge, withinLimit, options);
    const node = readNode(rule);

    expect(node?.kind === "branch" && node.test).toBe(isLarge);
    expect(node?.kind === "branch" && node.ifTrue).toBe(withinLimit);
  });

  it("does not see later changes to the array passed to pipeRules", () => {
    const rules: Rule<Order>[] = [hasItems];
    const pipeline = pipeRules<Order>(rules);

    rules.push(withinLimit);

    expect(toGraph(pipeline).root).toMatchObject({
      steps: [{ label: "hasItems" }],
    });
  });
});

describe("runtime behavior is unchanged", () => {
  const pipeline = pipeRules<Order>([
    hasItems,
    when<Order>(isLarge, withinLimit),
  ]);

  it("passes a valid order", async () => {
    expect(await pipeline({ items: 1, total: 600 })).toEqual(pass());
  });

  it("fails fast on the first failing step", async () => {
    expect(await pipeline({ items: 0, total: 5000 })).toEqual(
      fail("Cart is empty"),
    );
  });

  it("runs the guarded rule only when the predicate holds", async () => {
    expect(await pipeline({ items: 1, total: 5000 })).toEqual(
      fail("Over the limit"),
    );
    expect(await pipeline({ items: 1, total: 100 })).toEqual(pass());
  });
});

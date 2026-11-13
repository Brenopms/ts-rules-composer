import { describe, expect, it } from "vitest";

import { named, pass, pipeRules, type Rule, toGraph, when } from "../index";
import { usableName } from "./labels";

type Order = { total: number };

const hasItems: Rule<Order> = () => pass();
const isLarge = (order: Order) => order.total > 500;

const labelsOf = (rule: Rule<Order>) =>
  (toGraph(rule).root as { steps: { label: string }[] }).steps.map(
    (step) => step.label,
  );

describe("usableName", () => {
  it("returns the function name", () => {
    expect(usableName(hasItems)).toBe("hasItems");
  });

  it.each([
    ["empty", () => {}],
    ["bound", hasItems.bind(null)],
    [
      "anonymous",
      Object.defineProperty(() => {}, "name", { value: "anonymous" }),
    ],
  ])("ignores a %s name", (_label, fn) => {
    expect(usableName(fn)).toBeUndefined();
  });
});

describe("label resolution", () => {
  it("prefers the named() name over fn.name", () => {
    expect(
      labelsOf(pipeRules<Order>([named("Cart not empty", hasItems)])),
    ).toEqual(["Cart not empty"]);
  });

  it("falls back to fn.name", () => {
    expect(labelsOf(pipeRules<Order>([hasItems]))).toEqual(["hasItems"]);
  });

  it("numbers unlabelled rules in traversal order", () => {
    const pipeline = pipeRules<Order>([() => pass(), hasItems, () => pass()]);

    expect(labelsOf(pipeline)).toEqual(["rule #1", "hasItems", "rule #2"]);
  });

  it("does not use bound or empty names", () => {
    const pipeline = pipeRules<Order>([hasItems.bind(null)]);

    expect(labelsOf(pipeline)).toEqual(["rule #1"]);
  });

  it("labels a branch predicate the same way", () => {
    const named_ = when<Order>(named("Is large", isLarge), hasItems);
    const anon = when<Order>((order) => order.total > 1, hasItems);

    expect(toGraph(named_).root).toMatchObject({ test: "Is large" });
    expect(toGraph(anon).root).toMatchObject({ test: "rule #1" });
  });

  it("counts in depth-first order across nesting", () => {
    const pipeline = pipeRules<Order>([
      when<Order>(
        (order) => order.total > 1,
        () => pass(),
      ),
      () => pass(),
    ]);
    const [branch, last] = (
      toGraph(pipeline).root as { steps: Record<string, unknown>[] }
    ).steps;

    expect(branch).toMatchObject({
      test: "rule #1",
      ifTrue: { label: "rule #2" },
    });
    expect(last).toMatchObject({ label: "rule #3" });
  });

  it("gives identical ids and labels on repeated runs", () => {
    const pipeline = pipeRules<Order>([() => pass(), named("A", hasItems)]);

    expect(JSON.stringify(toGraph(pipeline))).toBe(
      JSON.stringify(toGraph(pipeline)),
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  composeRules,
  every,
  ifElse,
  inject,
  mapError,
  match,
  not,
  oneOf,
  pipeRules,
  type Rule,
  tap,
  toGraph,
  unless,
  validateField,
  when,
  withDebug,
  withFallback,
  withMemoize,
  withRetry,
  withTap,
  withTimeout,
} from "../index";
import { readNode } from "./node";
import {
  anyOrder,
  getTotal,
  hasItems,
  isLarge,
  isRetryable,
  logOrder,
  type Order,
  positive,
  withinLimit,
} from "./to-graph.fixtures";

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

  it.each([
    ["default (safe) mode", undefined],
    ["unsafe mode", { errorHandlingMode: "unsafe" as const }],
  ])("unless, %s", (_name, options) => {
    const rule = unless<Order>(isLarge, withinLimit, options);
    const node = readNode(rule);

    expect(node?.kind === "branch" && node.test).toBe(isLarge);
    expect(node?.kind === "branch" && node.ifFalse).toBe(withinLimit);
    expect(node?.kind === "branch" && node.ifTrue).toBeUndefined();
  });

  it.each([
    ["default (safe) mode", undefined],
    ["unsafe mode", { errorHandlingMode: "unsafe" as const }],
  ])("ifElse, %s", (_name, options) => {
    const rule = ifElse<Order>(isLarge, withinLimit, hasItems, options);
    const node = readNode(rule);

    expect(node?.kind === "branch" && node.test).toBe(isLarge);
    expect(node?.kind === "branch" && node.ifTrue).toBe(withinLimit);
    expect(node?.kind === "branch" && node.ifFalse).toBe(hasItems);
  });

  it.each([
    ["default (safe) mode", undefined],
    ["unsafe mode", { errorHandlingMode: "unsafe" as const }],
  ])("match, %s", (_name, options) => {
    const selector = (order: Order) => (order.total > 500 ? "large" : "small");
    const rule = match(
      selector,
      { large: withinLimit, small: hasItems },
      anyOrder,
      options,
    );
    const node = readNode(rule);

    expect(node?.kind === "switch" && node.selector).toBe(selector);
    expect(node?.kind === "switch" && node.cases.large).toBe(withinLimit);
    expect(node?.kind === "switch" && node.cases.small).toBe(hasItems);
    expect(node?.kind === "switch" && node.default).toBe(anyOrder);
  });

  it.each([
    ["default (safe) mode", undefined],
    ["unsafe mode", { errorHandlingMode: "unsafe" as const }],
  ])("every, oneOf and composeRules, %s", (_name, options) => {
    const allNode = readNode(every<Order>([hasItems, withinLimit], options));
    const anyNode = readNode(oneOf<Order>([hasItems, withinLimit], options));
    const composed = readNode(
      composeRules<Order>([hasItems, withinLimit], options),
    );

    expect(allNode?.kind === "all" && allNode.rules).toEqual([
      hasItems,
      withinLimit,
    ]);
    expect(anyNode?.kind === "any" && anyNode.rules).toEqual([
      hasItems,
      withinLimit,
    ]);
    expect(composed?.kind === "sequence" && composed.steps).toEqual([
      withinLimit,
      hasItems,
    ]);
    expect(composed?.kind === "sequence" && composed.steps[0]).toBe(
      withinLimit,
    );
  });

  it.each([
    ["default (safe) mode", undefined],
    ["unsafe mode", { errorHandlingMode: "unsafe" as const }],
  ])("not, withFallback, validateField and tap, %s", (_name, options) => {
    const notNode = readNode(not<Order>(hasItems, "no", options));
    const fallbackNode = readNode(
      withFallback<Order, string, unknown>(hasItems, withinLimit, {
        ...options,
        onlyFallbackOn: isRetryable,
      }),
    );
    const fieldNode = readNode(
      validateField<Order, number>(getTotal, positive, undefined, options),
    );
    const effectNode = readNode(tap<Order>(logOrder));

    expect(notNode?.kind === "not" && notNode.rule).toBe(hasItems);
    expect(fallbackNode?.kind === "fallback" && fallbackNode.main).toBe(
      hasItems,
    );
    expect(fallbackNode?.kind === "fallback" && fallbackNode.fallback).toBe(
      withinLimit,
    );
    expect(fallbackNode?.kind === "fallback" && fallbackNode.guard).toBe(
      isRetryable,
    );
    expect(fieldNode?.kind === "field" && fieldNode.getter).toBe(getTotal);
    expect(fieldNode?.kind === "field" && fieldNode.rule).toBe(positive);
    expect(effectNode?.kind === "effect" && effectNode.effect).toBe(logOrder);
  });

  it.each([
    ["default (safe) mode", undefined],
    ["unsafe mode", { errorHandlingMode: "unsafe" as const }],
  ])("withTimeout, withRetry and withMemoize, %s", (_name, options) => {
    const nodes = [
      readNode(withTimeout(hasItems, 100, "Timed out", options)),
      readNode(withRetry(hasItems)),
      readNode(withMemoize(hasItems, () => "key", options)),
    ];

    for (const node of nodes) {
      expect(node?.kind === "decorator" && node.rule).toBe(hasItems);
    }
  });

  it("withDebug, withTap and mapError keep the original rule", () => {
    const nodes = [
      readNode(withDebug(hasItems, "audit")),
      readNode(withTap<Order>(() => {})(hasItems)),
      readNode(mapError(hasItems, (error: string) => error)),
    ];

    for (const node of nodes) {
      expect(node?.kind === "decorator" && node.rule).toBe(hasItems);
    }
  });

  it("inject carries the configured rule's node, not a copy", () => {
    const pipeline = pipeRules<Order>([hasItems]);

    expect(readNode(inject(1, () => pipeline))).toBe(readNode(pipeline));
  });

  it("does not see later changes to the arrays passed to every, oneOf or composeRules", () => {
    const rules: Rule<Order>[] = [hasItems];
    const all = every<Order>(rules);
    const any = oneOf<Order>(rules);
    const composed = composeRules<Order>(rules);

    rules.push(withinLimit);

    const labelled = [expect.objectContaining({ label: "hasItems" })];
    expect(toGraph(all).root).toHaveProperty("rules", labelled);
    expect(toGraph(any).root).toHaveProperty("rules", labelled);
    expect(toGraph(composed).root).toHaveProperty("steps", labelled);
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

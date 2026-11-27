import { describe, expect, it, vi } from "vitest";

import {
  composeRules,
  type Decision,
  defineOutcomes,
  every,
  fail,
  ifElse,
  inject,
  mapError,
  match,
  named,
  not,
  oneOf,
  pass,
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
import { toMermaid } from "../mermaid";
import { attachNode } from "./node";
import {
  getTotal,
  hasItems,
  isLarge,
  logOrder,
  type Order,
  positive,
  withinLimit,
} from "./to-graph.fixtures";

describe("toGraph", () => {
  it("describes a plain function as a leaf labelled by its name", () => {
    expect(toGraph(hasItems)).toEqual({
      version: 2,
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

  it("describes unless as a branch with only a false side", () => {
    const rule = unless<Order>(isLarge, withinLimit);

    expect(toGraph(rule).root).toEqual({
      id: "root",
      kind: "branch",
      test: "isLarge",
      ifFalse: { id: "root.ifFalse", kind: "rule", label: "withinLimit" },
    });
  });

  it("describes ifElse as a branch with both sides", () => {
    const rule = ifElse<Order>(isLarge, withinLimit, hasItems);

    expect(toGraph(rule).root).toEqual({
      id: "root",
      kind: "branch",
      test: "isLarge",
      ifTrue: { id: "root.ifTrue", kind: "rule", label: "withinLimit" },
      ifFalse: { id: "root.ifFalse", kind: "rule", label: "hasItems" },
    });
  });

  it("describes ifElse without an else rule as a branch with only a true side", () => {
    const rule = ifElse<Order>(isLarge, withinLimit);

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

    expect(JSON.parse(JSON.stringify(graph))).toStrictEqual(graph);
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

describe("toGraph with a node it does not know", () => {
  it("describes it as a leaf rule instead of dropping it", () => {
    // The node key is a shared symbol, so another version or package could
    // attach a kind this one has never heard of.
    const unknown = attachNode(
      function futureRule() {
        return pass();
      },
      { kind: "mystery" } as never,
    );

    expect(toGraph(unknown).root).toEqual({
      id: "root",
      kind: "rule",
      label: "futureRule",
    });
    expect(toGraph(pipeRules<Order>([unknown, hasItems])).root).toMatchObject({
      steps: [{ kind: "rule", label: "futureRule" }, { label: "hasItems" }],
    });
  });
});

describe("runtime behavior is unchanged", () => {
  // Combinators used to return anonymous closures. A named one would leak into
  // `withDebug`'s ruleName and into labels, so attaching a node must not name them.
  it.each([
    ["pipeRules", () => pipeRules<Order>([hasItems])],
    ["composeRules", () => composeRules<Order>([hasItems])],
    ["every", () => every<Order>([hasItems])],
    ["oneOf", () => oneOf<Order>([hasItems])],
    ["when", () => when<Order>(isLarge, hasItems)],
    ["unless", () => unless<Order>(isLarge, hasItems)],
    ["ifElse", () => ifElse<Order>(isLarge, hasItems)],
    ["match", () => match(() => "a" as const, { a: hasItems })],
    ["not", () => not<Order>(hasItems, "no")],
    [
      "withFallback",
      () => withFallback<Order, string, unknown>(hasItems, hasItems),
    ],
    ["validateField", () => validateField<Order, number>(getTotal, positive)],
    ["tap", () => tap<Order>(logOrder)],
    ["withTimeout", () => withTimeout(hasItems, 1, "Timed out")],
    ["withRetry", () => withRetry(hasItems)],
    ["withMemoize", () => withMemoize(hasItems, () => "key")],
    ["withDebug", () => withDebug(hasItems, "audit")],
    ["withTap", () => withTap<Order>(() => {})(hasItems)],
    ["mapError", () => mapError(hasItems, (error: string) => error)],
    ["inject", () => inject(1, () => (order: Order) => hasItems(order))],
  ])("%s returns an anonymous function", (_name, build) => {
    expect(build().name).toBe("");
  });

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

describe("toGraph on a pipeline using every combinator", () => {
  const spies = () => ({
    rule: vi.fn<Rule<Order>>(() => pass()),
    positive: vi.fn<Rule<number>>(() => pass()),
    test: vi.fn((_order: Order) => true),
    selector: vi.fn((_order: Order) => "large" as "large" | "small"),
    guard: vi.fn((_error: string) => true),
    getter: vi.fn((order: Order) => order.total),
    effect: vi.fn((_order: Order) => {}),
    keyFn: vi.fn((_order: Order) => "key"),
    transform: vi.fn((error: string) => error),
  });

  const build = (s: ReturnType<typeof spies>) =>
    pipeRules<Order, string | string[]>([
      composeRules<Order>([s.rule, s.rule]),
      when<Order>(s.test, s.rule),
      unless<Order>(s.test, s.rule),
      ifElse<Order>(s.test, s.rule, s.rule),
      match(s.selector, { large: s.rule, small: s.rule }, "Unknown tier"),
      every<Order>([s.rule, s.rule]),
      oneOf<Order>([s.rule, s.rule]),
      not<Order>(s.rule, "Must fail"),
      withFallback<Order, string, unknown>(s.rule, s.rule, {
        onlyFallbackOn: s.guard,
      }),
      validateField<Order, number>(s.getter, s.positive),
      tap<Order>(s.effect),
      withTimeout(s.rule, 100, "Timed out"),
      withRetry(s.rule, { attempts: 2 }),
      withMemoize(s.rule, s.keyFn),
      withDebug(s.rule, "audit"),
      withTap<Order>(s.effect)(s.rule),
      mapError(s.rule, s.transform),
      inject({ limit: 1 }, () => s.rule),
    ]);

  type Json = { id?: string; kind?: string } & Record<string, unknown>;
  const walk = (value: unknown, visit: (node: Json) => void): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, visit);
      }
    } else if (value && typeof value === "object") {
      const node = value as Json;
      if (typeof node.id === "string") {
        visit(node);
      }
      for (const child of Object.values(node)) {
        walk(child, visit);
      }
    }
  };

  it("uses every node kind", () => {
    const kinds = new Set<string>();
    walk(toGraph(build(spies())).root, (node) => kinds.add(String(node.kind)));

    expect([...kinds].sort()).toEqual(
      [
        "all",
        "any",
        "branch",
        "decorator",
        "effect",
        "fallback",
        "field",
        "not",
        "rule",
        "sequence",
        "switch",
      ].sort(),
    );
  });

  it("survives a JSON round-trip unchanged", () => {
    const graph = toGraph(build(spies()));

    expect(JSON.parse(JSON.stringify(graph))).toStrictEqual(graph);
  });

  it("has unique node ids", () => {
    const ids: string[] = [];
    walk(toGraph(build(spies())).root, (node) => ids.push(String(node.id)));

    expect(ids.length).toBeGreaterThan(40);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic across calls and across equal builds", () => {
    const s = spies();
    const pipeline = build(s);

    expect(toGraph(pipeline)).toEqual(toGraph(pipeline));
    expect(toGraph(build(spies()))).toEqual(toGraph(pipeline));
  });

  it("never invokes any rule, predicate, selector, getter or effect", () => {
    const s = spies();
    toGraph(build(s));

    for (const spy of Object.values(s)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe("toGraph and toMermaid on a Decision", () => {
  type Shipping = "ship" | "hold";
  const credit = defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
  });

  it("describe a binary Decision as a leaf until decision kinds are recorded", () => {
    const shipOrder = vi.fn<Decision<Order, Shipping>>(() => ({
      outcome: "ship",
    }));
    const decision: Decision<Order, Shipping> = named("shipOrder", shipOrder);

    expect(toGraph(decision)).toEqual({
      version: 2,
      root: { id: "root", kind: "rule", label: "shipOrder" },
    });
    expect(toMermaid(decision)).toContain('root["shipOrder"]');
    expect(shipOrder).not.toHaveBeenCalled();
  });

  it("describe a toolkit-built Decision as a decision graph", () => {
    const approve = vi.fn(() => credit.outcome("approved"));
    const decline = vi.fn(() => credit.outcome("declined"));
    const isLargeOrder = vi.fn((order: Order) => order.total > 100);
    const decision = credit.ifElse(isLargeOrder, decline, approve);
    const graph = toGraph(decision);

    expect(graph).toMatchObject({
      version: 2,
      root: { id: "root", kind: "branch" },
      outcomes: ["declined", "review", "approved"],
      onError: "review",
    });
    expect(toMermaid(decision)).toContain(
      'outcome(["declined / review / approved"])',
    );
    expect(approve).not.toHaveBeenCalled();
    expect(decline).not.toHaveBeenCalled();
    expect(isLargeOrder).not.toHaveBeenCalled();
  });
});

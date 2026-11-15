import { describe, expect, it, vi } from "vitest";

import {
  composeRules,
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
import { readNode } from "./node";

type Order = { items: number; total: number };

const hasItems: Rule<Order> = (order) =>
  order.items > 0 ? pass() : fail("Cart is empty");
const withinLimit: Rule<Order> = (order) =>
  order.total <= 1000 ? pass() : fail("Over the limit");
const positive: Rule<number> = (n) => (n > 0 ? pass() : fail("Not positive"));
const getTotal = (order: Order) => order.total;
const isRetryable = (error: string) => error === "Over the limit";
const logOrder = (_order: Order) => {};
const anyOrder: Rule<Order> = () => pass();
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

  describe("every, oneOf and composeRules", () => {
    it("describes every as an all node", () => {
      expect(toGraph(every<Order>([hasItems, withinLimit])).root).toEqual({
        id: "root",
        kind: "all",
        rules: [
          { id: "root.rules.0", kind: "rule", label: "hasItems" },
          { id: "root.rules.1", kind: "rule", label: "withinLimit" },
        ],
      });
    });

    it("describes oneOf as an any node", () => {
      expect(toGraph(oneOf<Order>([hasItems, withinLimit])).root).toEqual({
        id: "root",
        kind: "any",
        rules: [
          { id: "root.rules.0", kind: "rule", label: "hasItems" },
          { id: "root.rules.1", kind: "rule", label: "withinLimit" },
        ],
      });
    });

    it("describes composeRules as a sequence in execution order", () => {
      expect(
        toGraph(composeRules<Order>([hasItems, withinLimit])).root,
      ).toEqual({
        id: "root",
        kind: "sequence",
        via: "composeRules",
        steps: [
          { id: "root.steps.0", kind: "rule", label: "withinLimit" },
          { id: "root.steps.1", kind: "rule", label: "hasItems" },
        ],
      });
    });

    it("records the order composeRules really runs in", async () => {
      const ran: string[] = [];
      const first: Rule<Order> = () => {
        ran.push("first");
        return pass();
      };
      const second: Rule<Order> = () => {
        ran.push("second");
        return pass();
      };
      const rule = composeRules<Order>([first, second]);

      await rule({ items: 1, total: 1 });

      const steps = (toGraph(rule).root as { steps: { label: string }[] })
        .steps;
      expect(steps.map((step) => step.label)).toEqual(["second", "first"]);
      expect(ran).toEqual(["second", "first"]);
    });

    it("nests inside other combinators", () => {
      const rule = pipeRules<Order>([
        composeRules<Order>([hasItems, withinLimit]),
      ]);

      expect(toGraph(rule).root).toMatchObject({
        steps: [{ id: "root.steps.0", kind: "sequence", via: "composeRules" }],
      });
    });

    it("never calls the rules", () => {
      const rule = vi.fn(() => pass());

      toGraph(every([rule]));
      toGraph(oneOf([rule]));
      toGraph(composeRules([rule]));

      expect(rule).not.toHaveBeenCalled();
    });
  });

  describe("not, withFallback, validateField and tap", () => {
    it("describes not as a node wrapping its rule", () => {
      expect(toGraph(not<Order>(hasItems, "Must be empty")).root).toEqual({
        id: "root",
        kind: "not",
        rule: { id: "root.rule", kind: "rule", label: "hasItems" },
      });
    });

    it("describes withFallback with main and fallback children", () => {
      expect(
        toGraph(withFallback<Order, string, unknown>(hasItems, withinLimit))
          .root,
      ).toEqual({
        id: "root",
        kind: "fallback",
        main: { id: "root.main", kind: "rule", label: "hasItems" },
        fallback: { id: "root.fallback", kind: "rule", label: "withinLimit" },
      });
    });

    it("labels the onlyFallbackOn guard, between main and fallback", () => {
      const rule = withFallback<Order, string, unknown>(
        (order) => hasItems(order),
        (order) => withinLimit(order),
        { onlyFallbackOn: isRetryable },
      );

      expect(toGraph(rule).root).toMatchObject({
        guard: "isRetryable",
        main: { label: "rule #1" },
        fallback: { label: "rule #2" },
      });
    });

    it("labels an inline guard with its option name", () => {
      const rule = withFallback<Order, string, unknown>(
        (order) => hasItems(order),
        (order) => withinLimit(order),
        { onlyFallbackOn: (error) => error.length > 0 },
      );

      expect(toGraph(rule).root).toMatchObject({
        main: { label: "rule #1" },
        guard: "onlyFallbackOn",
        fallback: { label: "rule #2" },
      });
    });

    it("numbers a guard that has no name in execution order", () => {
      // An array element gets no inferred name, unlike an object property.
      const [guard] = [(error: string) => error.length > 0];
      const rule = withFallback<Order, string, unknown>(
        (order) => hasItems(order),
        (order) => withinLimit(order),
        { onlyFallbackOn: guard },
      );

      expect(toGraph(rule).root).toMatchObject({
        main: { label: "rule #1" },
        guard: "rule #2",
        fallback: { label: "rule #3" },
      });
    });

    it("describes validateField with the getter label and the field rule", () => {
      expect(
        toGraph(validateField<Order, number>(getTotal, positive)).root,
      ).toEqual({
        id: "root",
        kind: "field",
        getter: "getTotal",
        rule: { id: "root.rule", kind: "rule", label: "positive" },
      });
    });

    it("describes tap as an effect with a label", () => {
      expect(toGraph(tap<Order>(logOrder)).root).toEqual({
        id: "root",
        kind: "effect",
        label: "logOrder",
      });
    });

    it("labels an effect with named", () => {
      const rule = tap<Order>(named("audit log", logOrder));

      expect(toGraph(rule).root).toMatchObject({ label: "audit log" });
    });

    it("nests inside other combinators", () => {
      const rule = pipeRules<Order>([
        tap<Order>(logOrder),
        not<Order>(hasItems, "Must be empty"),
      ]);

      expect(toGraph(rule).root).toMatchObject({
        steps: [
          { id: "root.steps.0", kind: "effect" },
          {
            id: "root.steps.1",
            kind: "not",
            rule: { id: "root.steps.1.rule" },
          },
        ],
      });
    });

    it("never calls any rule, guard, getter or effect", () => {
      const rule = vi.fn(() => pass());
      const guard = vi.fn(() => true);
      const getter = vi.fn(() => 1);
      const effect = vi.fn();

      toGraph(not(rule, "no"));
      toGraph(withFallback(rule, rule, { onlyFallbackOn: guard }));
      toGraph(validateField(getter, rule));
      toGraph(tap(effect));

      for (const spy of [rule, guard, getter, effect]) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  });

  describe("withTimeout, withRetry and withMemoize", () => {
    const byItems = (order: Order) => String(order.items);

    it("describes withTimeout as a decorator with its limit", () => {
      expect(toGraph(withTimeout(hasItems, 500, "Timed out")).root).toEqual({
        id: "root",
        kind: "decorator",
        decorator: "timeout",
        params: { ms: 500 },
        rule: { id: "root.rule", kind: "rule", label: "hasItems" },
      });
    });

    it("describes withRetry with its attempts and retryOn", () => {
      const rule = withRetry(hasItems, { attempts: 5, retryOn: "failed" });

      expect(toGraph(rule).root).toEqual({
        id: "root",
        kind: "decorator",
        decorator: "retry",
        params: { attempts: 5, retryOn: "failed" },
        rule: { id: "root.rule", kind: "rule", label: "hasItems" },
      });
    });

    it("shows withRetry's effective defaults", () => {
      expect(toGraph(withRetry(hasItems)).root).toMatchObject({
        params: { attempts: 3, retryOn: "both" },
      });
    });

    it("describes withMemoize with no params", () => {
      expect(toGraph(withMemoize(hasItems, byItems)).root).toEqual({
        id: "root",
        kind: "decorator",
        decorator: "memoize",
        params: {},
        rule: { id: "root.rule", kind: "rule", label: "hasItems" },
      });
    });

    it("keeps the whole tree of a decorated pipeline", () => {
      const rule = withTimeout(
        pipeRules<Order>([hasItems, withinLimit]),
        200,
        "Timed out",
      );

      expect(toGraph(rule).root).toMatchObject({
        kind: "decorator",
        rule: {
          id: "root.rule",
          kind: "sequence",
          steps: [{ id: "root.rule.steps.0" }, { id: "root.rule.steps.1" }],
        },
      });
    });

    it("nests decorators in application order", () => {
      const rule = withTimeout(
        withRetry(hasItems, { attempts: 2 }),
        200,
        "Timed out",
      );

      expect(toGraph(rule).root).toMatchObject({
        decorator: "timeout",
        rule: {
          id: "root.rule",
          decorator: "retry",
          rule: { id: "root.rule.rule" },
        },
      });
    });

    it("never calls the rule or the cache key function", () => {
      const rule = vi.fn(() => pass());
      const keyFn = vi.fn(() => "key");

      toGraph(withTimeout(rule, 1, "Timed out"));
      toGraph(withRetry(rule));
      toGraph(withMemoize(rule, keyFn));

      expect(rule).not.toHaveBeenCalled();
      expect(keyFn).not.toHaveBeenCalled();
    });

    it("starts no timers while describing", () => {
      vi.useFakeTimers();
      try {
        toGraph(withTimeout(hasItems, 500, "Timed out"));
        toGraph(withRetry(hasItems));

        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("withDebug, withTap, mapError and inject", () => {
    it("describes withDebug with its name, which also labels the rule", () => {
      expect(toGraph(withDebug(hasItems, "audit")).root).toEqual({
        id: "root",
        kind: "decorator",
        decorator: "debug",
        params: { name: "audit" },
        rule: { id: "root.rule", kind: "rule", label: "audit" },
      });
    });

    it("reads the name from the options object too", () => {
      expect(
        toGraph(withDebug(hasItems, { name: "audit" })).root,
      ).toMatchObject({ params: { name: "audit" }, rule: { label: "audit" } });
    });

    it("lets named win over the withDebug name", () => {
      const rule = withDebug(named("explicit", hasItems), "audit");

      expect(toGraph(rule).root).toMatchObject({
        params: { name: "audit" },
        rule: { label: "explicit" },
      });
    });

    it("falls back to the function name when withDebug has no name", () => {
      expect(toGraph(withDebug(hasItems, {})).root).toMatchObject({
        params: {},
        rule: { label: "hasItems" },
      });
    });

    it("does not number a rule that the withDebug name labels", () => {
      const rule = pipeRules<Order>([
        withDebug((order) => hasItems(order), "audit"),
        (order) => withinLimit(order),
      ]);

      expect(toGraph(rule).root).toMatchObject({
        steps: [{ rule: { label: "audit" } }, { label: "rule #1" }],
      });
    });

    it("passes the withDebug name through other decorators to the rule", () => {
      const rule = withDebug(
        withTimeout((order: Order) => hasItems(order), 100, "Timed out"),
        "audit",
      );

      expect(toGraph(rule).root).toMatchObject({
        decorator: "debug",
        rule: { decorator: "timeout", rule: { label: "audit" } },
      });
    });

    it("keeps a decorated pipeline's own labels", () => {
      const rule = withDebug(pipeRules<Order>([hasItems, withinLimit]), "all");

      expect(toGraph(rule).root).toMatchObject({
        params: { name: "all" },
        rule: {
          kind: "sequence",
          steps: [{ label: "hasItems" }, { label: "withinLimit" }],
        },
      });
    });

    it("describes withTap by decorating the rule it is applied to", () => {
      const effect = () => {};

      expect(toGraph(withTap<Order>(effect)(hasItems)).root).toEqual({
        id: "root",
        kind: "decorator",
        decorator: "tap",
        params: {},
        rule: { id: "root.rule", kind: "rule", label: "hasItems" },
      });
    });

    it("describes mapError as a decorator", () => {
      const rule = mapError(hasItems, (error: string) => error.length);

      expect(toGraph(rule).root).toEqual({
        id: "root",
        kind: "decorator",
        decorator: "mapError",
        params: {},
        rule: { id: "root.rule", kind: "rule", label: "hasItems" },
      });
    });

    it("describes inject as the rule it configures", () => {
      const pipeline = pipeRules<Order>([hasItems, withinLimit]);
      const injected = inject({ limit: 1 }, () => pipeline);

      expect(toGraph(injected)).toEqual(toGraph(pipeline));
    });

    it("labels an injected plain rule by its own name", () => {
      const injected = inject({ limit: 1 }, () => hasItems);

      expect(toGraph(injected).root).toEqual({
        id: "root",
        kind: "rule",
        label: "hasItems",
      });
    });

    it("numbers an injected anonymous rule like any other", () => {
      const injected = inject(
        { limit: 1 },
        () => (order: Order) => hasItems(order),
      );

      expect(toGraph(injected).root).toMatchObject({ label: "rule #1" });
    });

    it("never calls the effect, transform, debug hooks or injected rule", () => {
      const effect = vi.fn();
      const transform = vi.fn((error: string) => error);
      const onStart = vi.fn();
      const rule = vi.fn(() => pass());

      toGraph(withTap(effect)(rule));
      toGraph(mapError(rule, transform));
      toGraph(withDebug(rule, { name: "audit", onStart }));
      toGraph(inject(1, () => rule));

      for (const spy of [effect, transform, onStart, rule]) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  });

  describe("match", () => {
    const tier = (order: Order) => (order.total > 500 ? "large" : "small");

    it("describes a switch with one node per case key and a default error", () => {
      const rule = match(
        tier,
        { large: withinLimit, small: hasItems },
        "Unknown tier",
      );

      expect(toGraph(rule).root).toEqual({
        id: "root",
        kind: "switch",
        selector: "tier",
        cases: [
          {
            key: "large",
            node: { id: "root.cases.0", kind: "rule", label: "withinLimit" },
          },
          {
            key: "small",
            node: { id: "root.cases.1", kind: "rule", label: "hasItems" },
          },
        ],
        defaultError: "Unknown tier",
      });
    });

    it("describes a rule default as a default node", () => {
      const rule = match(
        tier,
        { large: withinLimit, small: hasItems },
        hasItems,
      );

      expect(toGraph(rule).root).toMatchObject({
        default: { id: "root.default", kind: "rule", label: "hasItems" },
      });
      expect(toGraph(rule).root).not.toHaveProperty("defaultError");
    });

    it("marks a missing default by leaving both default fields out", () => {
      const rule = match(tier, { large: withinLimit, small: hasItems });
      const root = toGraph(rule).root;

      expect(root).not.toHaveProperty("default");
      expect(root).not.toHaveProperty("defaultError");
    });

    it("never exposes a non-string default error's contents", () => {
      const coded: Rule<Order, { code: number }> = () => pass();
      const rule = match<Order, { code: number }>(
        tier,
        { large: coded, small: coded },
        { code: 400 },
      );

      expect(toGraph(rule).root).toMatchObject({
        defaultError: "custom error",
      });
    });

    it("labels the selector with named and numbers unlabelled ones", () => {
      const labelled = match(named("order tier", tier), {
        large: withinLimit,
        small: hasItems,
      });
      const anonymous = match(
        (order: Order) => (order.total > 500 ? "large" : "small"),
        { large: withinLimit, small: hasItems },
      );

      expect(toGraph(labelled).root).toMatchObject({ selector: "order tier" });
      expect(toGraph(anonymous).root).toMatchObject({ selector: "rule #1" });
    });

    it("keeps numeric and symbol case keys as strings", () => {
      const tag = Symbol("tag");
      const rule = match((order: Order) => order.items as 1 | 2, {
        1: hasItems,
        2: withinLimit,
      });
      const symbolic = match(() => tag, { [tag]: hasItems });

      expect(toGraph(rule).root).toMatchObject({
        cases: [{ key: "1" }, { key: "2" }],
      });
      expect(toGraph(symbolic).root).toMatchObject({
        cases: [{ key: "Symbol(tag)" }],
      });
    });

    it("never calls the selector or the case rules", () => {
      const selector = vi.fn(() => "a" as const);
      const rule = vi.fn(() => pass());

      toGraph(match(selector, { a: rule }, rule));

      expect(selector).not.toHaveBeenCalled();
      expect(rule).not.toHaveBeenCalled();
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

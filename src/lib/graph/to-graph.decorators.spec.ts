import { describe, expect, it, vi } from "vitest";

import {
  inject,
  mapError,
  named,
  pass,
  pipeRules,
  toGraph,
  withDebug,
  withLazyContext,
  withMemoize,
  withRetry,
  withTap,
  withTimeout,
} from "../index";
import { hasItems, type Order, withinLimit } from "./to-graph.fixtures";

describe("toGraph", () => {
  describe("withTimeout, withRetry and withMemoize", () => {
    const byItems = (order: Order) => String(order.items);

    it("does not let a caller edit the rule's recorded params", () => {
      const rule = withRetry(hasItems, { attempts: 5 });
      const graph = toGraph(rule);
      (graph.root as { params: Record<string, unknown> }).params.attempts = 99;

      expect(toGraph(rule).root).toMatchObject({ params: { attempts: 5 } });
    });

    it("keeps a non-finite limit JSON-safe", () => {
      const graph = toGraph(withTimeout(hasItems, Infinity, "Timed out"));

      expect(graph.root).toMatchObject({ params: { ms: "Infinity" } });
      expect(JSON.parse(JSON.stringify(graph))).toStrictEqual(graph);
      expect(
        toGraph(withRetry(hasItems, { attempts: Infinity })).root,
      ).toMatchObject({ params: { attempts: "Infinity" } });
    });

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

    it("describes withLazyContext as a decorator around the rule it feeds", () => {
      const loader = vi.fn(async () => ({}));
      const rule = withLazyContext(loader, hasItems);

      expect(toGraph(rule).root).toEqual({
        id: "root",
        kind: "decorator",
        decorator: "lazyContext",
        params: {},
        rule: { id: "root.rule", kind: "rule", label: "hasItems" },
      });
      expect(loader).not.toHaveBeenCalled();
    });

    it("keeps the rules inside a withLazyContext pipeline reachable", () => {
      const rule = withLazyContext(
        async () => ({}),
        pipeRules<Order>([hasItems, withinLimit]),
      );

      expect(toGraph(rule).root).toMatchObject({
        kind: "decorator",
        rule: {
          kind: "sequence",
          steps: [{ label: "hasItems" }, { label: "withinLimit" }],
        },
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
});

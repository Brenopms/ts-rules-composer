import { describe, expect, it, vi } from "vitest";

import {
  composeRules,
  every,
  named,
  not,
  oneOf,
  pass,
  pipeRules,
  type Rule,
  tap,
  toGraph,
  validateField,
  withFallback,
} from "../index";
import {
  getTotal,
  hasItems,
  isRetryable,
  logOrder,
  type Order,
  positive,
  withinLimit,
} from "./to-graph.fixtures";

describe("toGraph", () => {
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
});

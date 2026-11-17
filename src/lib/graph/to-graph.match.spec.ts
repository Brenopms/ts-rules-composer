import { describe, expect, it, vi } from "vitest";

import { fail, match, named, pass, type Rule, toGraph } from "../index";
import { hasItems, type Order, withinLimit } from "./to-graph.fixtures";

describe("toGraph", () => {
  describe("match", () => {
    const tier = (order: Order) => (order.total > 500 ? "large" : "small");

    it("leaves out a case that is not a rule, as match skips it at runtime", async () => {
      const cases = { large: undefined, small: hasItems } as unknown as Record<
        "large" | "small",
        Rule<Order>
      >;
      const rule = match(tier, cases, "Unknown tier");

      expect(toGraph(rule).root).toMatchObject({
        cases: [{ key: "small", node: { label: "hasItems" } }],
      });
      expect(await rule({ items: 1, total: 900 })).toEqual(
        fail("Unknown tier"),
      );
    });

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
});

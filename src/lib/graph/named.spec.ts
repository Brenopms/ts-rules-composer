import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { fail, named, pass, pipeRules, type Rule, toGraph } from "../index";

type Order = { items: number };

const hasItems: Rule<Order> = (order) =>
  order.items > 0 ? pass() : fail("Cart is empty");

describe("named", () => {
  it("returns a different function and leaves its argument untouched", () => {
    const keys = Reflect.ownKeys(hasItems);
    const wrapped = named("Has items", hasItems);

    expect(wrapped).not.toBe(hasItems);
    expect(Reflect.ownKeys(hasItems)).toEqual(keys);
    expect(toGraph(hasItems).root).toMatchObject({ label: "hasItems" });
  });

  it("labels the rule in the graph and carries params", () => {
    const rule = named("Min age", hasItems, { params: { years: 18 } });

    expect(toGraph(rule).root).toEqual({
      id: "root",
      kind: "rule",
      label: "Min age",
      params: { years: 18 },
    });
  });

  it("forwards arguments and returns a sync result synchronously", () => {
    const rule = named("Has items", hasItems);
    const result = rule({ items: 1 });

    expect(result).toEqual(pass());
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("forwards an async result untouched", async () => {
    const asyncRule: Rule<Order> = async () => fail("nope");
    const rule = named("Async", asyncRule);

    const result = rule({ items: 1 });

    expect(result).toBeInstanceOf(Promise);
    expect(await result).toEqual(fail("nope"));
  });

  it("passes every argument through, including the context", () => {
    const spy = vi.fn((_input: Order, _context?: { user: string }) => pass());
    named("Spy", spy)({ items: 1 }, { user: "ada" });

    expect(spy).toHaveBeenCalledWith({ items: 1 }, { user: "ada" });
  });

  it("preserves the type of the function it wraps", () => {
    const rule = named("Has items", hasItems);
    expectTypeOf(rule).toEqualTypeOf<typeof hasItems>();

    const predicate = named("Large", (order: Order) => order.items > 5);
    expectTypeOf(predicate).toEqualTypeOf<(order: Order) => boolean>();
  });

  it("works as a step in a pipeline", async () => {
    const pipeline = pipeRules<Order>([named("Has items", hasItems)]);

    expect(await pipeline({ items: 0 })).toEqual(fail("Cart is empty"));
  });
});

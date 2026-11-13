import { describe, expect, it } from "vitest";

import { attachNode, type Fn, NODE_KEY, type RawNode, readNode } from "./node";

const sequenceNode = (steps: Fn[] = []): RawNode => ({
  kind: "sequence",
  via: "pipeRules",
  steps,
});

describe("attachNode / readNode", () => {
  it("returns the identical function it was given", () => {
    const rule = () => ({ status: "passed" as const });

    expect(attachNode(rule, sequenceNode([]))).toBe(rule);
  });

  it("makes the node readable from the returned function", () => {
    const node = sequenceNode([]);
    const rule = attachNode(() => 1, node);

    expect(readNode(rule)).toBe(node);
  });

  it("returns undefined for plain functions and non-functions", () => {
    expect(readNode(() => 1)).toBeUndefined();
    expect(readNode(undefined)).toBeUndefined();
    expect(readNode(null)).toBeUndefined();
    expect(readNode({ kind: "sequence" })).toBeUndefined();
    expect(readNode("rule")).toBeUndefined();
  });

  it("uses a registry symbol shared across module instances", () => {
    expect(NODE_KEY).toBe(Symbol.for("ts-rules-composer.node"));

    const node = sequenceNode([]);
    const rule = attachNode(() => 1, node);

    expect((rule as unknown as Record<symbol, unknown>)[NODE_KEY]).toBe(node);
  });

  it("does not change how the function looks or behaves", () => {
    const rule = function hasItems(n: number) {
      return n * 2;
    };
    attachNode(rule, sequenceNode([]));

    expect(rule(2)).toBe(4);
    expect(rule.name).toBe("hasItems");
    expect(Object.keys(rule)).toEqual([]);
    expect(Object.getOwnPropertySymbols({ ...rule })).toEqual([]);
    expect(JSON.stringify({ rule })).toBe("{}");
  });

  it("does not copy the node onto a bound function", () => {
    const rule = attachNode(() => 1, sequenceNode([]));

    expect(readNode(rule.bind(null))).toBeUndefined();
  });

  it("lets a later attach replace an earlier one without throwing", () => {
    const first = sequenceNode([]);
    const second: RawNode = {
      kind: "sequence",
      via: "composeRules",
      steps: [],
    };
    const rule = () => 1;

    attachNode(rule, first);

    expect(() => attachNode(rule, second)).not.toThrow();
    expect(readNode(rule)).toBe(second);
  });
});

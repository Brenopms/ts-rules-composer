import { describe, expect, it } from "vitest";
import { calculateDelay } from "./calculate-delay";

describe("calculateDelay", () => {
  it("uses the fixed delay when no strategy is given", () => {
    expect(calculateDelay(undefined, 5, 100)).toBe(100);
  });

  it("returns the initial delay for the fixed strategy on every attempt", () => {
    expect(calculateDelay("fixed", 1, 100)).toBe(100);
    expect(calculateDelay("fixed", 4, 100)).toBe(100);
  });

  it("scales the delay by attempt for the linear strategy", () => {
    expect(calculateDelay("linear", 1, 100)).toBe(100);
    expect(calculateDelay("linear", 3, 100)).toBe(300);
    expect(calculateDelay("linear", 0, 100)).toBe(0);
  });

  it("doubles the delay per attempt for the exponential strategy", () => {
    expect(calculateDelay("exponential", 1, 100)).toBe(100);
    expect(calculateDelay("exponential", 2, 100)).toBe(200);
    expect(calculateDelay("exponential", 3, 100)).toBe(400);
  });

  it("falls back to the initial delay for an unknown strategy name", () => {
    expect(calculateDelay("bogus" as never, 3, 100)).toBe(100);
  });

  it("calls a custom strategy function with the attempt number", () => {
    const custom = (attempt: number) => attempt * 7;

    expect(calculateDelay(custom, 3, 100)).toBe(21);
  });

  it("falls back to the fixed delay for a strategy of an unsupported type", () => {
    expect(calculateDelay(42 as never, 3, 100)).toBe(100);
  });
});

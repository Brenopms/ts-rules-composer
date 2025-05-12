import { describe, it, expect } from "vitest";
import { pipe } from "./pipe";

describe("pipe", () => {
  it("should return input when no functions provided", () => {
    expect(pipe(42)).toBe(42);
  });

  it("should apply single function", () => {
    const result = pipe(2, (x) => x * 3);
    expect(result).toBe(6);
  });

  it("should chain multiple functions", () => {
    const result = pipe(
      5,
      (x) => x + 1,
      (x) => x * 2,
      String,
    );
    expect(result).toBe("12");
  });

  it("should maintain type safety", () => {
    const length = (s: string) => s.length;
    const double = (n: number) => n * 2;

    // Valid usage
    const result = pipe("hello", length, double);
    expect(result).toBe(10);

    pipe(
      // @ts-expect-error - Should fail if types don't line up
      "hello",
      double, // Can't apply number operation to string
    );
  });

  it("should work with rule combinators", () => {
    const add1 = (x: number) => x + 1;
    const times2 = (x: number) => x * 2;
    const toString = (x: number) => x.toString();

    const result = pipe(3, add1, times2, toString);
    expect(result).toBe("8");
  });
});

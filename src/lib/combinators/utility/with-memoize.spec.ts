import { describe, vi, beforeEach, it, expect } from "vitest";
import { Rule } from "../../types";
import { withMemoize } from "./with-memoize";
import { pass } from "../../helpers";

describe("withMemoize", () => {
  const mockRule = vi.fn(() => pass());
  const keyFn = (input: { id: string }) => input.id;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRule.mockClear();
  });

  it("should cache results", async () => {
    const memoized = withMemoize(mockRule, keyFn);
    const input = { id: "123" };

    await memoized(input);
    await memoized(input);

    expect(mockRule).toHaveBeenCalledTimes(1);
  });

  it("should distinguish different inputs", async () => {
    const memoized = withMemoize(mockRule, keyFn);

    await memoized({ id: "123" });
    await memoized({ id: "456" });

    expect(mockRule).toHaveBeenCalledTimes(2);
  });

  it("should handle async rules", async () => {
    const asyncRule = vi.fn(async () => {
      await Promise.resolve();
      return pass();
    });
    const memoized = withMemoize(asyncRule, keyFn);

    await memoized({ id: "123" });
    await memoized({ id: "123" });

    expect(asyncRule).toHaveBeenCalledTimes(1);
  });

  it("should respect TTL", async () => {
    vi.useFakeTimers();
    const memoized = withMemoize(mockRule, keyFn, { ttl: 1000 });

    await memoized({ id: "123" });
    vi.advanceTimersByTime(1500);
    await memoized({ id: "123" });

    expect(mockRule).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("should enforce max size", async () => {
    const memoized = withMemoize(mockRule, keyFn, { maxSize: 2 });

    await memoized({ id: "1" });
    await memoized({ id: "2" });
    await memoized({ id: "3" }); // Evicts '1'
    await memoized({ id: "1" }); // Cache miss

    expect(mockRule).toHaveBeenCalledTimes(4);
  });

  it("should maintain type safety", () => {
    type StrictInput = { id: string };
    const typedRule: Rule<StrictInput, string> = () => pass();

    // Valid usage
    withMemoize(typedRule, (input) => input.id);

    // @ts-expect-error - Should fail if keyFn doesn't match input type
    withMemoize(typedRule, (input: { other: number }) =>
      input.other.toString(),
    );
  });
});

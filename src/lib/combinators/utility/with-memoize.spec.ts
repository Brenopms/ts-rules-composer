import { beforeEach, describe, expect, it, vi } from "vitest";
import { pass } from "../../helpers";
import type { Rule } from "../../types";
import { withMemoize } from "./with-memoize";

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

  it("should not evict anything on a cache hit at max size", async () => {
    const memoized = withMemoize(mockRule, keyFn, { maxSize: 2 });

    await memoized({ id: "1" });
    await memoized({ id: "2" });
    await memoized({ id: "1" }); // Hit, cache is full
    await memoized({ id: "2" }); // Hit, must still be cached

    expect(mockRule).toHaveBeenCalledTimes(2);
  });

  it("should evict the oldest inserted entry first (FIFO)", async () => {
    const memoized = withMemoize(mockRule, keyFn, { maxSize: 2 });

    await memoized({ id: "1" });
    await memoized({ id: "2" });
    await memoized({ id: "1" }); // Hit does not refresh recency
    await memoized({ id: "3" }); // Evicts '1', not '2'
    await memoized({ id: "2" }); // Still cached

    expect(mockRule).toHaveBeenCalledTimes(3);

    await memoized({ id: "1" }); // Was evicted
    expect(mockRule).toHaveBeenCalledTimes(4);
  });

  it("should evict an empty-string key when it is the oldest", async () => {
    const memoized = withMemoize(mockRule, keyFn, { maxSize: 1 });

    await memoized({ id: "" });
    await memoized({ id: "1" }); // Evicts ''
    await memoized({ id: "" }); // Miss

    expect(mockRule).toHaveBeenCalledTimes(3);
  });

  it("should evict rejected promises from the cache", async () => {
    const failing = vi
      .fn<() => Promise<ReturnType<typeof pass>>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(pass());
    const memoized = withMemoize(failing, keyFn, {
      errorHandlingMode: "unsafe",
    });

    await expect(memoized({ id: "1" })).rejects.toThrow("boom");
    await memoized({ id: "1" });

    expect(failing).toHaveBeenCalledTimes(2);
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

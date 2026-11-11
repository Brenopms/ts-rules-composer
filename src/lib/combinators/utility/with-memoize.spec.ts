import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
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

  describe("context-aware key", () => {
    type Ctx = { userId: string };
    const ctxKey = (input: { id: string }, context?: Ctx) =>
      `${context?.userId}:${input.id}`;

    it("does not share entries between different contexts", async () => {
      const rule = vi.fn(() => pass());
      const memoized = withMemoize(rule, ctxKey);
      const input = { id: "doc" };

      await memoized(input, { userId: "alice" });
      await memoized(input, { userId: "bob" });

      expect(rule).toHaveBeenCalledTimes(2);
    });

    it("still caches for the same context", async () => {
      const rule = vi.fn(() => pass());
      const memoized = withMemoize(rule, ctxKey);
      const input = { id: "doc" };

      await memoized(input, { userId: "alice" });
      await memoized(input, { userId: "alice" });

      expect(rule).toHaveBeenCalledTimes(1);
    });

    it("passes the call's context to keyFn", async () => {
      const key = vi.fn((input: { id: string }) => input.id);
      const memoized = withMemoize(
        (_: { id: string }, _ctx?: Ctx) => pass(),
        key,
      );
      const context = { userId: "alice" };

      await memoized({ id: "doc" }, context);

      expect(key).toHaveBeenCalledWith({ id: "doc" }, context);
    });

    it("a serialized key keeps separator-ambiguous callers apart", async () => {
      const rule = vi.fn(() => pass());
      const serialized = (input: { id: string }, context?: Ctx) =>
        JSON.stringify([context?.userId, input.id]);
      const memoized = withMemoize(rule, serialized);

      await memoized({ id: "c" }, { userId: "a:b" });
      await memoized({ id: "b:c" }, { userId: "a" });

      expect(rule).toHaveBeenCalledTimes(2);
    });

    it("a separator-joined key collides for those callers (documented hazard)", async () => {
      const rule = vi.fn(() => pass());
      const memoized = withMemoize(rule, ctxKey);

      await memoized({ id: "c" }, { userId: "a:b" });
      await memoized({ id: "b:c" }, { userId: "a" });

      expect(rule).toHaveBeenCalledTimes(1);
    });

    it("one-argument keys keep sharing entries across contexts", async () => {
      const rule = vi.fn(() => pass());
      const memoized = withMemoize(rule, keyFn);

      await memoized({ id: "doc" }, { userId: "alice" });
      await memoized({ id: "doc" }, { userId: "bob" });

      expect(rule).toHaveBeenCalledTimes(1);
    });

    it("types the keyFn context as TContext | undefined", () => {
      const ctxRule: Rule<{ id: string }, string, Ctx> = () => pass();

      withMemoize(ctxRule, (input, context) => {
        expectTypeOf(context).toEqualTypeOf<Ctx | undefined>();
        return `${context?.userId}:${input.id}`;
      });
    });
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

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { fail, pass } from "../../helpers";
import type { Rule, RuleResult } from "../../types";
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

  it("should still cache when maxSize is negative and there is nothing to evict", async () => {
    const memoized = withMemoize(mockRule, keyFn, { maxSize: -1 });

    await memoized({ id: "1" });
    await memoized({ id: "1" });

    expect(mockRule).toHaveBeenCalledTimes(1);
  });

  it("should cache the result of a synchronous rule in unsafe mode", async () => {
    const syncRule = vi.fn(() => pass());
    const memoized = withMemoize(syncRule, keyFn, {
      errorHandlingMode: "unsafe",
    });

    await memoized({ id: "1" });
    await memoized({ id: "1" });

    expect(syncRule).toHaveBeenCalledTimes(1);
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

  describe("caught failures (rule-error-provenance)", () => {
    type Input = { id: string };
    const outage = new Error("sanctions service down");
    const marked: RuleResult = {
      outcome: "failed",
      error: "down",
      caughtCause: outage,
    };

    // ES2022 has no Promise.withResolvers; the executor runs synchronously.
    const deferred = <T>() => {
      const handlers = {
        resolve: (_value: T) => {},
        reject: (_reason: unknown) => {},
      };
      const promise = new Promise<T>((resolve, reject) => {
        handlers.resolve = resolve;
        handlers.reject = reject;
      });
      return { promise, ...handlers };
    };

    // Lets every queued settlement handler run.
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    afterEach(() => {
      vi.useRealTimers();
    });

    it("recomputes a caught failure (the rule threw) on the next call", async () => {
      const rule = vi
        .fn<Rule<Input>>()
        .mockRejectedValueOnce(outage)
        .mockResolvedValue(pass());
      const memoized = withMemoize(rule, keyFn);

      const first = await memoized({ id: "1" });
      const second = await memoized({ id: "1" });

      expect(first.outcome === "failed" && first.caughtCause).toBe(outage);
      expect(second).toEqual(pass());
      expect(rule).toHaveBeenCalledTimes(2);
    });

    it("recomputes a returned caught failure on the next call", async () => {
      const rule = vi.fn<Rule<Input>>(() => marked);
      const memoized = withMemoize(rule, keyFn);

      expect(await memoized({ id: "1" })).toBe(marked);
      await memoized({ id: "1" });

      expect(rule).toHaveBeenCalledTimes(2);
    });

    it("still caches a business failure", async () => {
      const rule = vi.fn<Rule<Input>>(() => fail("denied"));
      const memoized = withMemoize(rule, keyFn);

      await memoized({ id: "1" });
      await memoized({ id: "1" });

      expect(rule).toHaveBeenCalledTimes(1);
    });

    it("concurrent waiters share one call and all get the caught failure", async () => {
      const pending = deferred<RuleResult>();
      const rule = vi.fn<Rule<Input>>(() => pending.promise);
      const memoized = withMemoize(rule, keyFn);

      const waiters = [memoized({ id: "1" }), memoized({ id: "1" })];
      pending.resolve(marked);
      const results = await Promise.all(waiters);

      expect(results[0]).toBe(marked);
      expect(results[1]).toBe(marked);
      expect(rule).toHaveBeenCalledTimes(1);

      await memoized({ id: "1" });
      expect(rule).toHaveBeenCalledTimes(2);
    });

    it("evicts a synchronous caught failure from an unsafe wrapper", async () => {
      const rule = vi.fn<Rule<Input>>(() => marked);
      const memoized = withMemoize(rule, keyFn, {
        errorHandlingMode: "unsafe",
      });

      await memoized({ id: "1" });
      await memoized({ id: "1" });

      expect(rule).toHaveBeenCalledTimes(2);
    });

    it("ignores a result that isn't an object in unsafe mode (kept as before)", async () => {
      const rule = vi.fn(() => Promise.resolve(undefined as never));
      const memoized = withMemoize<Input>(rule, keyFn, {
        errorHandlingMode: "unsafe",
      });

      await memoized({ id: "1" });
      await flush();
      await memoized({ id: "1" });

      expect(rule).toHaveBeenCalledTimes(1);
    });

    // An unsafe rule may return an object whose `outcome` getter throws.
    const uninspectable = () =>
      Object.defineProperty({ error: "down" }, "outcome", {
        enumerable: true,
        get() {
          throw new Error("outcome unavailable");
        },
      }) as unknown as RuleResult;

    it("caches a synchronous result it can't inspect (unsafe), as before", async () => {
      const result = uninspectable();
      const rule = vi.fn<Rule<Input>>(() => result);
      const memoized = withMemoize(rule, keyFn, {
        errorHandlingMode: "unsafe",
      });

      expect(await memoized({ id: "1" })).toBe(result);
      expect(await memoized({ id: "1" })).toBe(result);
      expect(rule).toHaveBeenCalledOnce();
    });

    it("caches a resolved result it can't inspect (unsafe), with no unhandled rejection", async () => {
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      const result = uninspectable();
      const rule = vi.fn<Rule<Input>>(() => Promise.resolve(result));
      const memoized = withMemoize(rule, keyFn, {
        errorHandlingMode: "unsafe",
      });

      try {
        expect(await memoized({ id: "1" })).toBe(result);
        await flush();
        expect(await memoized({ id: "1" })).toBe(result);
        expect(rule).toHaveBeenCalledOnce();
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off("unhandledRejection", unhandled);
      }
    });

    type Settle = "caught fulfilment" | "rejection";
    const settle = (
      stale: ReturnType<typeof deferred<RuleResult>>,
      how: Settle,
    ) => {
      if (how === "rejection") {
        stale.reject(outage);
      } else {
        stale.resolve(marked);
      }
      stale.promise.catch(() => {});
    };

    it.each<Settle>(["caught fulfilment", "rejection"])(
      "a stale %s after TTL replacement leaves the newer entry in place",
      async (how) => {
        vi.useFakeTimers();
        const calls = [deferred<RuleResult>(), deferred<RuleResult>()];
        const queue = [...calls];
        const rule = vi.fn<Rule<Input>>(() => queue.shift()?.promise ?? pass());
        const memoized = withMemoize(rule, keyFn, {
          ttl: 1000,
          errorHandlingMode: "unsafe",
        });

        Promise.resolve(memoized({ id: "1" })).catch(() => {});
        vi.advanceTimersByTime(1500);
        const fresh = memoized({ id: "1" });
        calls[1]?.resolve(pass());
        await fresh;
        settle(calls[0] ?? deferred(), how);
        await vi.advanceTimersByTimeAsync(0);

        expect(await memoized({ id: "1" })).toEqual(pass());
        expect(rule).toHaveBeenCalledTimes(2);
      },
    );

    it.each<Settle>(["caught fulfilment", "rejection"])(
      "a stale %s after maxSize replacement leaves the newer entry in place",
      async (how) => {
        const calls = [deferred<RuleResult>(), deferred<RuleResult>()];
        const queue = [...calls];
        const forKey = vi.fn<Rule<Input>>(
          () => queue.shift()?.promise ?? pass(),
        );
        const rule = vi.fn<Rule<Input>>((input) =>
          input.id === "1" ? forKey(input) : pass(),
        );
        const memoized = withMemoize(rule, keyFn, {
          maxSize: 1,
          errorHandlingMode: "unsafe",
        });

        Promise.resolve(memoized({ id: "1" })).catch(() => {});
        await memoized({ id: "2" }); // evicts "1"
        const fresh = memoized({ id: "1" }); // evicts "2"
        calls[1]?.resolve(pass());
        await fresh;
        settle(calls[0] ?? deferred(), how);
        await flush();

        expect(await memoized({ id: "1" })).toEqual(pass());
        expect(forKey).toHaveBeenCalledTimes(2);
      },
    );

    it("with a shared promise, only the current entry's own handler evicts it", async () => {
      const shared = deferred<RuleResult>();
      const rule = vi.fn<Rule<Input>>((input) =>
        input.id === "1" ? shared.promise : pass(),
      );
      const memoized = withMemoize(rule, keyFn, {
        maxSize: 1,
        errorHandlingMode: "unsafe",
      });

      const oldEntry = memoized({ id: "1" }); // its handler is registered first
      await memoized({ id: "2" }); // evicts "1"
      // Registered between the old entry's handler and the replacement's.
      const between = shared.promise.then(() => memoized({ id: "1" }));
      const replacement = memoized({ id: "1" }); // same promise
      expect(rule).toHaveBeenCalledTimes(3);

      shared.resolve(marked);
      expect(await between).toBe(marked);
      expect(rule).toHaveBeenCalledTimes(3); // hit the replacement

      await flush();
      await memoized({ id: "1" }); // both handlers ran: recomputed
      expect(rule).toHaveBeenCalledTimes(4);
      expect(await oldEntry).toBe(marked);
      expect(await replacement).toBe(marked);
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

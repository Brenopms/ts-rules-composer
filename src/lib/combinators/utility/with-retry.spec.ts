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
import type { Rule } from "../../types";
import { withRetry } from "./with-retry";

describe("withRetry combinator", () => {
  const successOnThirdTry = vi
    .fn()
    .mockImplementationOnce(() => fail("First error"))
    .mockImplementationOnce(() => fail("Second error"))
    .mockImplementationOnce(() => pass());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should succeed if rule eventually passes", async () => {
    const rule = withRetry(successOnThirdTry, {
      attempts: 3,
      delayMs: 100,
      retryStrategy: "fixed",
    });

    const resultPromise = rule({});

    // Advance through all retries
    await vi.advanceTimersByTimeAsync(300);
    const result = await resultPromise;

    expect(result).toEqual(pass());
    expect(successOnThirdTry).toHaveBeenCalledTimes(3);
  });

  it("should apply exponential backoff strategy", async () => {
    const mockRule = vi.fn(() => fail("Error"));
    const rule = withRetry(mockRule, {
      attempts: 3,
      delayMs: 100,
      retryStrategy: "exponential", // 100ms, 200ms, 400ms
    });

    const resultPromise = rule({});

    // First attempt (no delay)
    expect(mockRule).toHaveBeenCalledTimes(1);

    // First retry after 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(mockRule).toHaveBeenCalledTimes(2);

    // Second retry after 200ms (total 300ms)
    await vi.advanceTimersByTimeAsync(200);
    expect(mockRule).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(400);
    const result = await resultPromise;
    expect(result).toEqual(fail("MAX_RETRIES_EXCEEDED"));
  });

  it("should apply linear backoff strategy", async () => {
    const mockRule = vi.fn(() => fail("Error"));
    const rule = withRetry(mockRule, {
      attempts: 3,
      delayMs: 50,
      retryStrategy: "linear", // 50ms, 100ms, 150ms
    });

    const resultPromise = rule({});

    await vi.advanceTimersByTimeAsync(50);
    expect(mockRule).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(100);
    expect(mockRule).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(150);
    const result = await resultPromise;
    expect(result.outcome).toBe("failed");
  });

  it("should use custom strategy function", async () => {
    const mockRule = vi.fn(() => fail("Error"));
    const customStrategy = vi.fn((attempt) => attempt * 25);

    const rule = withRetry(mockRule, {
      attempts: 3,
      delayMs: 25,
      retryStrategy: customStrategy,
    });

    const resultPromise = rule({});

    // First attempt (no delay)
    expect(mockRule).toHaveBeenCalledTimes(1);

    // First retry after 25ms (attempt 1 * 25ms)
    await vi.advanceTimersByTimeAsync(25);
    expect(customStrategy).toHaveBeenCalledWith(1); // Only expect attempt number
    expect(mockRule).toHaveBeenCalledTimes(2);

    // Second retry after 50ms (attempt 2 * 25ms)
    await vi.advanceTimersByTimeAsync(50);
    expect(customStrategy).toHaveBeenCalledWith(2);
    expect(mockRule).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(75);
    const result = await resultPromise;
    expect(result.outcome).toBe("failed");
    expect(customStrategy).toHaveBeenCalledTimes(2); // Called for attempts 1 and 2
  });
  it("should fail after max attempts", async () => {
    const alwaysFails = vi.fn(() => fail("Persistent error"));
    const rule = withRetry(alwaysFails, {
      attempts: 2,
      delayMs: 10,
    });

    const resultPromise = rule({});
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual(fail("MAX_RETRIES_EXCEEDED"));
    expect(alwaysFails).toHaveBeenCalledTimes(2);
  });

  it("should use shouldRetry predicate", async () => {
    const mockRule = vi
      .fn()
      .mockImplementationOnce(() => fail("First error"))
      .mockImplementationOnce(() => fail("Second error"));

    const shouldRetry = vi
      .fn()
      .mockReturnValueOnce(true) // Retry first error
      .mockReturnValue(false); // Don't retry second

    const rule = withRetry(mockRule, {
      attempts: 3,
      shouldRetry,
      delayMs: 10,
      retryStrategy: "fixed", // Explicit strategy for predictability
    });

    // Run the test without waiting for actual delays
    vi.spyOn(global, "setTimeout").mockImplementation((fn) => fn() as any);

    const result = await rule({});

    expect(result).toEqual(fail("Second error"));
    expect(shouldRetry).toHaveBeenCalledWith("First error", 1);
    expect(mockRule).toHaveBeenCalledTimes(2);

    // Clean up
    vi.restoreAllMocks();
  });

  it("should pass context to each attempt", async () => {
    const context = { userId: 123 };
    const rule = withRetry(successOnThirdTry, {
      attempts: 3,
      delayMs: 10,
    });

    // Run the test without waiting for actual delays
    vi.spyOn(global, "setTimeout").mockImplementation((fn) => fn() as any);

    await rule({}, context);

    expect(successOnThirdTry).toHaveBeenCalledWith({}, context);
  });

  it("should handle thrown errors", async () => {
    const errorRule = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(pass());

    const rule = withRetry(errorRule, {
      attempts: 2,
      shouldRetry: (e) => (e as Error).message === "Network error",
    });

    // Run the test without waiting for actual delays
    vi.spyOn(global, "setTimeout").mockImplementation((fn) => fn() as any);

    const result = await rule({});
    expect(result).toEqual(pass());
  });

  it("should fail on non-retryable thrown errors", async () => {
    const errorRule = vi.fn().mockRejectedValue(new Error("Fatal"));

    const rule = withRetry(errorRule, {
      shouldRetry: (e) => (e as Error).message !== "Fatal",
    });

    const result = await rule({});
    expect(result.outcome).toBe("failed");
    expect((result as any).error.message).toBe("Fatal");
  });

  describe("retryOn", () => {
    it('"thrown" returns a failed result immediately without retrying', async () => {
      const denies = vi.fn(() => fail("denied"));
      const rule = withRetry(denies, { attempts: 3, retryOn: "thrown" });

      const result = await rule({});

      expect(result).toEqual(fail("denied"));
      expect(denies).toHaveBeenCalledTimes(1);
    });

    it('"thrown" still retries thrown exceptions', async () => {
      const flaky = vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(pass());
      const rule = withRetry(flaky, {
        attempts: 3,
        delayMs: 0,
        retryOn: "thrown",
      });

      expect(await rule({})).toEqual(pass());
      expect(flaky).toHaveBeenCalledTimes(2);
    });

    it('"thrown" does not let a deny-then-pass rule pass', async () => {
      const noThenYes = vi
        .fn()
        .mockImplementationOnce(() => fail("no"))
        .mockImplementationOnce(() => pass());
      const rule = withRetry(noThenYes, { retryOn: "thrown" });

      expect((await rule({})).outcome).toBe("failed");
      expect(noThenYes).toHaveBeenCalledTimes(1);
    });

    it('"failed" retries failed results', async () => {
      const eventually = vi
        .fn()
        .mockImplementationOnce(() => fail("a"))
        .mockImplementationOnce(() => fail("b"))
        .mockImplementationOnce(() => pass());
      const rule = withRetry(eventually, {
        attempts: 3,
        delayMs: 0,
        retryOn: "failed",
      });

      expect(await rule({})).toEqual(pass());
      expect(eventually).toHaveBeenCalledTimes(3);
    });

    it('"failed" does not retry thrown exceptions', async () => {
      const error = new Error("boom");
      const throws = vi.fn().mockRejectedValue(error);
      const rule = withRetry(throws, {
        attempts: 3,
        delayMs: 0,
        retryOn: "failed",
      });

      const result = await rule({});

      expect(throws).toHaveBeenCalledTimes(1);
      // A thrown attempt ends as a caught failure: payload and cause are the throw.
      expect(result).toEqual({ ...fail(error), caughtCause: error });
    });

    it("composes with shouldRetry: both must allow the retry", async () => {
      const throws = vi.fn().mockRejectedValue(new Error("boom"));
      const rule = withRetry(throws, {
        attempts: 3,
        delayMs: 0,
        retryOn: "thrown",
        shouldRetry: () => false,
      });

      await rule({});

      expect(throws).toHaveBeenCalledTimes(1);
    });

    it('defaults to "both"', async () => {
      const mixed = vi
        .fn()
        .mockImplementationOnce(() => fail("x"))
        .mockRejectedValueOnce(new Error("y"))
        .mockResolvedValueOnce(pass());
      const rule = withRetry(mixed, { attempts: 3, delayMs: 0 });

      expect(await rule({})).toEqual(pass());
      expect(mixed).toHaveBeenCalledTimes(3);
    });
  });

  describe("onExhausted", () => {
    it('"last-error" returns the final error object after all attempts', async () => {
      const errors = [{ code: 1 }, { code: 2 }, { code: 3 }];
      const rule = vi
        .fn()
        .mockImplementationOnce(() => fail(errors[0]))
        .mockImplementationOnce(() => fail(errors[1]))
        .mockImplementationOnce(() => fail(errors[2]));

      const result = await withRetry(rule, {
        attempts: 3,
        delayMs: 0,
        onExhausted: "last-error",
      })({});

      expect(rule).toHaveBeenCalledTimes(3);
      expect(result.outcome).toBe("failed");
      expect((result as { error: unknown }).error).toBe(errors[2]);
    });

    it('"last-error" returns the final thrown value', async () => {
      const boom = new Error("boom");
      const rule = vi.fn().mockRejectedValue(boom);

      const result = await withRetry(rule, {
        attempts: 2,
        delayMs: 0,
        onExhausted: "last-error",
      })({});

      expect(result).toEqual({ ...fail(boom), caughtCause: boom });
    });

    it('"last-error" return type excludes "MAX_RETRIES_EXCEEDED"', () => {
      const typed: Rule<{ id: string }, { code: number }> = () =>
        fail({ code: 1 });

      const lastError = withRetry(typed, { onExhausted: "last-error" });
      expectTypeOf(lastError).toEqualTypeOf<
        Rule<{ id: string }, { code: number }, unknown>
      >();

      const maxRetries = withRetry(typed, { onExhausted: "max-retries" });
      expectTypeOf(maxRetries).toEqualTypeOf<
        Rule<{ id: string }, { code: number } | "MAX_RETRIES_EXCEEDED", unknown>
      >();
    });

    it('defaults to "max-retries" (literal error and type)', async () => {
      const typed: Rule<{ id: string }, { code: number }> = () =>
        fail({ code: 1 });
      const rule = withRetry(typed, { attempts: 2, delayMs: 0 });

      expectTypeOf(rule).toEqualTypeOf<
        Rule<{ id: string }, { code: number } | "MAX_RETRIES_EXCEEDED", unknown>
      >();
      expect(await rule({ id: "a" })).toEqual(fail("MAX_RETRIES_EXCEEDED"));
    });

    it("accepts a union-typed mode and widens the error type", () => {
      const typed: Rule<{ id: string }, { code: number }> = () =>
        fail({ code: 1 });
      const mode = "last-error" as "max-retries" | "last-error";

      expectTypeOf(withRetry(typed, { onExhausted: mode })).toEqualTypeOf<
        Rule<{ id: string }, { code: number } | "MAX_RETRIES_EXCEEDED", unknown>
      >();
    });

    it("keeps the context type", () => {
      const ctxRule: Rule<string, string, { userId: string }> = () => pass();

      expectTypeOf(
        withRetry(ctxRule, { onExhausted: "last-error" }),
      ).toEqualTypeOf<Rule<string, string, { userId: string }>>();
    });
  });

  describe("caught failures (rule-error-provenance)", () => {
    const outage = new Error("sanctions service down");
    const marked = {
      outcome: "failed",
      error: "mapped",
      caughtCause: outage,
    } as const;
    const causeOf = (result: object) =>
      Object.hasOwn(result, "caughtCause")
        ? (result as { caughtCause: unknown }).caughtCause
        : "no own caughtCause";

    it('retryOn "failed" does not retry a marked attempt', async () => {
      const rule = vi.fn(() => marked);

      const result = await withRetry(rule, {
        attempts: 3,
        delayMs: 0,
        retryOn: "failed",
      })({});

      expect(rule).toHaveBeenCalledTimes(1);
      expect(result).toStrictEqual(marked);
    });

    it('retryOn "thrown" retries a marked attempt', async () => {
      const rule = vi
        .fn()
        .mockImplementationOnce(() => marked)
        .mockImplementationOnce(() => pass());

      const result = await withRetry(rule, {
        attempts: 3,
        delayMs: 0,
        retryOn: "thrown",
      })({});

      expect(rule).toHaveBeenCalledTimes(2);
      expect(result).toEqual(pass());
    });

    it("counts a marked attempt with an undefined cause as thrown", async () => {
      const rule = vi.fn(() => ({
        outcome: "failed" as const,
        error: "mapped",
        caughtCause: undefined,
      }));

      const result = await withRetry(rule, {
        attempts: 3,
        delayMs: 0,
        retryOn: "failed",
      })({});

      expect(rule).toHaveBeenCalledTimes(1);
      expect(Object.hasOwn(result, "caughtCause")).toBe(true);
      expect(causeOf(result)).toBeUndefined();
    });

    it("passes shouldRetry the thrown value, the caught cause, or the business error", async () => {
      const boom = new Error("boom");
      const rule = vi
        .fn()
        .mockRejectedValueOnce(boom)
        .mockImplementationOnce(() => marked)
        .mockImplementationOnce(() => fail("no"))
        .mockImplementationOnce(() => pass());
      const shouldRetry = vi.fn<(error: unknown, attempt: number) => boolean>(
        () => true,
      );

      const result = await withRetry(rule, {
        attempts: 4,
        delayMs: 0,
        shouldRetry,
      })({});

      expect(result).toEqual(pass());
      expect(rule).toHaveBeenCalledTimes(4);
      expect(shouldRetry.mock.calls).toStrictEqual([
        [boom, 1],
        [outage, 2],
        ["no", 3],
      ]);
      expect(shouldRetry.mock.calls[1]?.[0]).toBe(outage);
    });

    it('under the default "both", a throw, a business failure, then a pass returns the pass', async () => {
      const rule = vi
        .fn()
        .mockRejectedValueOnce(outage)
        .mockImplementationOnce(() => fail("no"))
        .mockImplementationOnce(() => pass());

      const result = await withRetry(rule, { attempts: 3, delayMs: 0 })({});

      expect(result).toEqual(pass());
      expect(rule).toHaveBeenCalledTimes(3);
    });

    it("treats an inherited caughtCause as a business failure (own keys only)", async () => {
      const inherited = Object.assign(Object.create({ caughtCause: outage }), {
        outcome: "failed",
        error: "no",
      });
      const rule = vi.fn(() => inherited);
      const shouldRetry = vi.fn<(error: unknown, attempt: number) => boolean>(
        () => true,
      );

      const result = await withRetry(rule, {
        attempts: 2,
        delayMs: 0,
        retryOn: "failed",
        shouldRetry,
        onExhausted: "last-error",
      })({});

      expect(rule).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledWith("no", 1);
      expect(result).toStrictEqual(fail("no"));
    });

    it("reads a business failure's error once (shouldRetry and the payload see the same value)", async () => {
      const read = vi.fn(() => ({ code: "no" }));
      const withGetter = {
        outcome: "failed" as const,
        get error() {
          return read();
        },
      };
      const shouldRetry = vi.fn<(error: unknown, attempt: number) => boolean>(
        () => false,
      );

      const result = await withRetry(() => withGetter, { shouldRetry })({});

      expect(read).toHaveBeenCalledOnce();
      expect(result.outcome === "failed" && result.error).toBe(
        shouldRetry.mock.calls[0]?.[0],
      );
    });

    it("with no attempts, returns an unmarked failure without calling the rule", async () => {
      const rule = vi.fn(() => marked);

      const result = await withRetry(rule, { attempts: 0 })({});

      expect(rule).not.toHaveBeenCalled();
      expect(result).toStrictEqual(fail("MAX_RETRIES_EXCEEDED"));
    });

    type Final = "thrown" | "marked" | "business";
    type Ending = "early veto" | "last-error" | "max-retries";

    const finalRule = (final: Final) => {
      if (final === "thrown") {
        return vi.fn(() => Promise.reject(outage));
      }
      if (final === "marked") {
        return vi.fn(() => marked);
      }
      return vi.fn(() => fail("mapped"));
    };

    const endWith = (final: Final, ending: Ending) => {
      const rule = finalRule(final);
      if (ending === "early veto") {
        return withRetry(rule, {
          attempts: 3,
          delayMs: 0,
          shouldRetry: () => false,
        });
      }
      return withRetry(rule, { attempts: 2, delayMs: 0, onExhausted: ending });
    };

    it.each<[Final, Ending, unknown, unknown]>([
      ["thrown", "early veto", outage, outage],
      ["thrown", "last-error", outage, outage],
      ["thrown", "max-retries", "MAX_RETRIES_EXCEEDED", outage],
      ["marked", "early veto", "mapped", outage],
      ["marked", "last-error", "mapped", outage],
      ["marked", "max-retries", "MAX_RETRIES_EXCEEDED", outage],
      ["business", "early veto", "mapped", "no own caughtCause"],
      ["business", "last-error", "mapped", "no own caughtCause"],
      ["business", "max-retries", "MAX_RETRIES_EXCEEDED", "no own caughtCause"],
    ])(
      "final %s attempt, %s → error %o, cause %o",
      async (final, ending, error, cause) => {
        const result = await endWith(final, ending)({});

        expect(result.outcome).toBe("failed");
        expect(result.outcome === "failed" && result.error).toBe(error);
        expect(causeOf(result)).toBe(cause);
      },
    );
  });

  // Type safety tests
  it("should preserve input types", () => {
    type StrictInput = { id: string };
    const typedRule: Rule<StrictInput, string> = () => pass();

    // Valid usage
    withRetry(typedRule, { attempts: 2 });

    withRetry((_: { other: number }) => pass(), { attempts: 2 })({
      // @ts-expect-error - Should fail if input types mismatch
      id: "123",
    });
  });
});

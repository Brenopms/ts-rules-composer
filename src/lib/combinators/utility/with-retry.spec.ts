import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(result.status).toBe("failed");
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
    expect(result.status).toBe("failed");
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
    expect(result.status).toBe("failed");
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

      expect((await rule({})).status).toBe("failed");
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
      expect(result).toEqual(fail(error));
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

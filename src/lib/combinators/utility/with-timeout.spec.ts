import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getRuleError } from "../../../test/helpers/get-rule-error";
import { fail, pass } from "../../helpers";
import type { Rule, RuleResult } from "../../types";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  // Mock rules
  const mockPassingRule: Rule<string> = vi.fn(() => Promise.resolve(pass()));
  const mockFailingRule: Rule<string> = vi.fn(() =>
    Promise.resolve(fail("Expected error")),
  );
  const createSlowRule = (delayMs: number): Rule<string> =>
    vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return pass();
    });

  it("should pass through immediate success", async () => {
    const rule = withTimeout(mockPassingRule, 100, "Timeout error");
    const resultPromise = rule("input");

    // Advance just enough to let microtasks run
    await Promise.resolve();
    vi.advanceTimersByTime(0);

    const result = await resultPromise;
    expect(result.outcome).toBe("passed");
    expect(mockPassingRule).toHaveBeenCalledWith("input", undefined);
  });

  it("should pass through immediate failure", async () => {
    const rule = withTimeout(mockFailingRule, 100, "Timeout error");
    const resultPromise = rule("input");

    await Promise.resolve();
    vi.advanceTimersByTime(0);

    const result = await resultPromise;
    expect(result.outcome).toBe("failed");
    expect(getRuleError(result)).toBe("Expected error");
  });

  it("should timeout when rule exceeds limit", async () => {
    const slowRule = createSlowRule(200);
    const rule = withTimeout(slowRule, 100, "Timeout exceeded");

    const resultPromise = rule("input");
    vi.advanceTimersByTime(100); // Trigger timeout

    const result = await resultPromise;
    expect(result.outcome).toBe("failed");

    expect(getRuleError(result)).toBe("Timeout exceeded");
  });

  it("should complete successfully if finished before timeout", async () => {
    const slowRule = createSlowRule(50);
    const rule = withTimeout(slowRule, 100, "Timeout error");

    const resultPromise = rule("input");
    vi.advanceTimersByTime(50); // Rule completes

    const result = await resultPromise;
    expect(result.outcome).toBe("passed");
  });

  it("should handle context correctly", async () => {
    const contextRule: Rule<string, string, { id: number }> = vi.fn(
      async (_, ctx) => (ctx?.id === 1 ? pass() : fail("Invalid context")),
    );

    const rule = withTimeout(contextRule, 100, "Timeout error");
    const resultPromise = rule("input", { id: 1 });

    await Promise.resolve();
    vi.advanceTimersByTime(0);

    const result = await resultPromise;
    expect(result.outcome).toBe("passed");
    expect(contextRule).toHaveBeenCalledWith("input", { id: 1 });
  });

  it("marks a timeout as caught, with timeoutError as payload and cause", async () => {
    const timeoutError = { code: "TIMEOUT" };
    const rule = withTimeout<string, unknown, unknown>(
      createSlowRule(200),
      100,
      timeoutError,
    );

    const resultPromise = rule("input");
    vi.advanceTimersByTime(100);
    const result = await resultPromise;

    expect(result).toStrictEqual({
      outcome: "failed",
      error: timeoutError,
      caughtCause: timeoutError,
    });
    expect(result.outcome === "failed" && result.error).toBe(timeoutError);
    expect(result.outcome === "failed" && result.caughtCause).toBe(
      timeoutError,
    );
  });

  it("marks a timeout as caught when timeoutError is undefined", async () => {
    const rule = withTimeout(createSlowRule(200), 100, undefined);

    const resultPromise = rule("input");
    vi.advanceTimersByTime(100);
    const result = await resultPromise;

    expect(Object.hasOwn(result, "caughtCause")).toBe(true);
    expect(result).toStrictEqual({
      outcome: "failed",
      error: undefined,
      caughtCause: undefined,
    });
  });

  it.each<[string, RuleResult<string>]>([
    ["a business failure", fail("Expected error")],
    [
      "a caught failure",
      { outcome: "failed", error: "down", caughtCause: new Error("down") },
    ],
  ])(
    "forwards %s from a child that wins, by identity",
    async (_, childResult) => {
      const rule = withTimeout(() => childResult, 100, "Timeout error");

      const resultPromise = rule("input");
      vi.advanceTimersByTime(0);

      expect(await resultPromise).toBe(childResult);
    },
  );

  it("should work with immediate timeout (0ms)", async () => {
    const slowRule = createSlowRule(10);
    const rule = withTimeout(slowRule, 0, "Instant error");

    const resultPromise = rule("input");
    vi.advanceTimersByTime(0); // Trigger immediate timeout

    const result = await resultPromise;
    expect(result.outcome).toBe("failed");
    expect(getRuleError(result)).toBe("Instant error");
  });
});

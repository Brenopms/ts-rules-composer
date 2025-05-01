import {
  describe,
  beforeAll,
  vi,
  afterEach,
  afterAll,
  it,
  expect,
} from "vitest";
import { pass, fail } from "../../helpers";
import { Rule } from "../../types";
import { withTimeout } from "./with-timeout";
import { getRuleError } from "../../../test/helpers/get-rule-error";

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
    expect(result.status).toBe("passed");
    expect(mockPassingRule).toHaveBeenCalledWith("input", undefined);
  });

  it("should pass through immediate failure", async () => {
    const rule = withTimeout(mockFailingRule, 100, "Timeout error");
    const resultPromise = rule("input");

    await Promise.resolve();
    vi.advanceTimersByTime(0);

    const result = await resultPromise;
    expect(result.status).toBe("failed");
    expect(getRuleError(result)).toBe("Expected error");
  });

  it("should timeout when rule exceeds limit", async () => {
    const slowRule = createSlowRule(200);
    const rule = withTimeout(slowRule, 100, "Timeout exceeded");

    const resultPromise = rule("input");
    vi.advanceTimersByTime(100); // Trigger timeout

    const result = await resultPromise;
    expect(result.status).toBe("failed");

    expect(getRuleError(result)).toBe("Timeout exceeded");
  });

  it("should complete successfully if finished before timeout", async () => {
    const slowRule = createSlowRule(50);
    const rule = withTimeout(slowRule, 100, "Timeout error");

    const resultPromise = rule("input");
    vi.advanceTimersByTime(50); // Rule completes

    const result = await resultPromise;
    expect(result.status).toBe("passed");
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
    expect(result.status).toBe("passed");
    expect(contextRule).toHaveBeenCalledWith("input", { id: 1 });
  });

  it("should work with immediate timeout (0ms)", async () => {
    const slowRule = createSlowRule(10);
    const rule = withTimeout(slowRule, 0, "Instant error");

    const resultPromise = rule("input");
    vi.advanceTimersByTime(0); // Trigger immediate timeout

    const result = await resultPromise;
    expect(result.status).toBe("failed");
    expect(getRuleError(result)).toBe("Instant error");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fail, pass } from "../../helpers";
import { withFallback } from "./with-fallback";

describe("withFallback", () => {
  const mockMainRule = vi.fn();
  const mockFallback = vi.fn();

  beforeEach(() => {
    mockMainRule.mockReset();
    mockFallback.mockReset();
  });

  it("should execute fallback when main rule fails", async () => {
    mockMainRule.mockResolvedValue(fail("Main failed"));
    mockFallback.mockResolvedValue(pass());

    const rule = withFallback(mockMainRule, mockFallback);
    const result = await rule("test");

    expect(mockMainRule).toHaveBeenCalledWith("test", undefined);
    expect(mockFallback).toHaveBeenCalledWith("test", undefined);
    expect(result).toEqual(pass());
  });

  it("should not execute fallback when main rule passes", async () => {
    mockMainRule.mockResolvedValue(pass());

    const rule = withFallback(mockMainRule, mockFallback);
    const result = await rule("test");

    expect(mockFallback).not.toHaveBeenCalled();
    expect(result).toEqual(pass());
  });

  it("should respect conditional fallback predicate", async () => {
    mockMainRule.mockResolvedValue(fail({ code: "RETRYABLE" }));
    mockFallback.mockResolvedValue(pass());

    const rule = withFallback(mockMainRule, mockFallback, {
      onlyFallbackOn: (err) => (err as any).code === "RETRYABLE",
    });

    await rule("test");
    expect(mockFallback).toHaveBeenCalled();

    mockMainRule.mockResolvedValue(fail({ code: "FATAL" }));
    await rule("test");
    expect(mockFallback).toHaveBeenCalledTimes(1); // Not called for FATAL
  });

  it("should preserve context", async () => {
    const context = { auth: true };
    mockMainRule.mockResolvedValue(fail("Failed"));
    mockFallback.mockResolvedValue(pass());

    const rule = withFallback(mockMainRule, mockFallback);
    await rule("test", context);

    expect(mockMainRule).toHaveBeenCalledWith("test", context);
    expect(mockFallback).toHaveBeenCalledWith("test", context);
  });

  it("should maintain type safety", async () => {
    // Type test - no runtime assertion needed
    const stringRule = (_: string) => pass();
    const numberRule = (_: number) => pass();

    // @ts-expect-error - Should fail type check
    withFallback(stringRule, numberRule);
  });
});

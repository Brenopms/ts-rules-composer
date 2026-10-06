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

  it("should execute the fallback Rule when the main Rule fails", async () => {
    mockMainRule.mockResolvedValue(fail("Main failed"));
    mockFallback.mockResolvedValue(pass());

    const rule = withFallback(mockMainRule, mockFallback);
    const result = await rule("test");

    expect(mockMainRule).toHaveBeenCalledWith("test", undefined);
    expect(mockFallback).toHaveBeenCalledWith("test", undefined);
    expect(result).toEqual(pass());
  });

  it("should not execute the fallback Rule when the main Rule passes", async () => {
    mockMainRule.mockResolvedValue(pass());

    const rule = withFallback(mockMainRule, mockFallback);
    const result = await rule("test");

    expect(mockFallback).not.toHaveBeenCalled();
    expect(result).toEqual(pass());
  });

  it("should respect the conditional fallback Rule predicate", async () => {
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

  it("should preserve Context", async () => {
    const context = { auth: true };
    mockMainRule.mockResolvedValue(fail("Failed"));
    mockFallback.mockResolvedValue(pass());

    const rule = withFallback(mockMainRule, mockFallback);
    await rule("test", context);

    expect(mockMainRule).toHaveBeenCalledWith("test", context);
    expect(mockFallback).toHaveBeenCalledWith("test", context);
  });

  it("should propagate a primary Rule throw in unsafe mode", async () => {
    const thrown = new Error("primary threw");
    const primaryRule = vi.fn(() => {
      throw thrown;
    });
    const fallbackRule = vi.fn();

    const rule = withFallback(primaryRule, fallbackRule, {
      errorHandlingMode: "unsafe",
    });

    await expect(rule("test")).rejects.toBe(thrown);
    expect(fallbackRule).not.toHaveBeenCalled();
  });

  it("should propagate a fallback Rule throw in unsafe mode", async () => {
    const thrown = new Error("fallback threw");
    const primaryRule = vi.fn().mockResolvedValue(fail("try fallback"));
    const fallbackRule = vi.fn(() => {
      throw thrown;
    });

    const rule = withFallback(primaryRule, fallbackRule, {
      errorHandlingMode: "unsafe",
    });

    await expect(rule("test")).rejects.toBe(thrown);
  });

  it("should transform a primary Rule throw", async () => {
    const transformedError = { message: "transformed primary" };
    const primaryRule = vi.fn(() => {
      throw new Error("primary threw");
    });
    const fallbackRule = vi.fn();

    const rule = withFallback(primaryRule, fallbackRule, {
      errorTransform: () => transformedError,
      onlyFallbackOn: () => false,
    });

    await expect(rule("test")).resolves.toEqual(fail(transformedError));
    expect(fallbackRule).not.toHaveBeenCalled();
  });

  it("should transform a fallback Rule throw", async () => {
    const transformedError = { message: "transformed fallback" };
    const primaryRule = vi.fn().mockResolvedValue(fail("try fallback"));
    const fallbackRule = vi.fn(() => {
      throw new Error("fallback threw");
    });

    const rule = withFallback(primaryRule, fallbackRule, {
      errorTransform: () => transformedError,
    });

    await expect(rule("test")).resolves.toEqual(fail(transformedError));
  });

  it("should leave explicit RuleResults unchanged by the error transform", async () => {
    const explicitFailure = fail("declared failure");
    const primaryRule = vi.fn().mockResolvedValue(explicitFailure);
    const fallbackRule = vi.fn();

    const rule = withFallback(primaryRule, fallbackRule, {
      errorTransform: () => "transformed",
      onlyFallbackOn: () => false,
    });

    await expect(rule("test")).resolves.toBe(explicitFailure);
    expect(fallbackRule).not.toHaveBeenCalled();
  });

  it("should maintain Rule type safety", async () => {
    // Type test - no runtime assertion needed
    const stringRule = (_: string) => pass();
    const numberRule = (_: number) => pass();

    // @ts-expect-error - Should fail type check
    withFallback(stringRule, numberRule);
  });
});

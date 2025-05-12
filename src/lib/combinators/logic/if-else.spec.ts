import { describe, vi, beforeEach, it, expect } from "vitest";
import { pass, fail } from "../../helpers";
import { Rule } from "../../types";
import { ifElse } from "./if-else";

describe("branch", () => {
  const mockTruePredicate = vi.fn(() => true);
  const mockFalsePredicate = vi.fn(() => false);
  const asyncTruePredicate = vi.fn(async () => true);

  const passingRule: Rule<string> = vi.fn(() => pass());
  const failingRule: Rule<string> = vi.fn(() => fail("Failed rule"));
  const contextAwareRule: Rule<string, string, { mode: string }> = vi.fn(
    (_, ctx) => (ctx?.mode === "test" ? pass() : fail("Invalid context")),
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute ifRule when predicate returns true", async () => {
    const rule = ifElse(mockTruePredicate, passingRule);
    const result = await rule("input");
    expect(result.status).toBe("passed");
    expect(mockTruePredicate).toHaveBeenCalledWith("input", undefined);
    expect(passingRule).toHaveBeenCalled();
  });

  it("should execute elseRule when provided and predicate returns false", async () => {
    const rule = ifElse(mockFalsePredicate, failingRule, passingRule);
    const result = await rule("input");
    expect(result.status).toBe("passed");
    expect(passingRule).toHaveBeenCalled();
  });

  it("should return pass() when no elseRule provided and predicate returns false", async () => {
    const rule = ifElse(mockFalsePredicate, failingRule);
    const result = await rule("input");
    expect(result.status).toBe("passed");
    expect(failingRule).not.toHaveBeenCalled();
  });

  it("should work with async predicates", async () => {
    const rule = ifElse(asyncTruePredicate, passingRule);
    const result = await rule("input");
    expect(result.status).toBe("passed");
    expect(asyncTruePredicate).toHaveBeenCalled();
    expect(passingRule).toHaveBeenCalled();
  });

  it("should pass context to both predicate and rules", async () => {
    const context = { mode: "test" };
    const rule = ifElse((_, ctx) => ctx?.mode === "test", contextAwareRule);
    const result = await rule("input", context);
    expect(result.status).toBe("passed");
    expect(contextAwareRule).toHaveBeenCalledWith("input", context);
  });

  it("should handle failing ifRule", async () => {
    const rule = ifElse(mockTruePredicate, failingRule);
    const result = await rule("input");
    expect(result.status).toBe("failed");
    expect(result).toEqual(fail("Failed rule"));
  });

  it("should handle failing elseRule", async () => {
    const rule = ifElse(mockFalsePredicate, passingRule, failingRule);
    const result = await rule("input");
    expect(result.status).toBe("failed");
    expect(result).toEqual(fail("Failed rule"));
  });
});

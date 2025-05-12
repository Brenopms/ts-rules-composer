import { describe, it, expect, vi } from "vitest";
import { match } from "./match";
import type { Rule } from "../../types";

describe("match combinator", () => {
  // Mock rules for testing
  const mockPass = vi.fn().mockResolvedValue({ status: "passed" });
  const mockFail = vi
    .fn()
    .mockResolvedValue({ status: "failed", error: "error" });
  const mockAsyncPass = vi.fn().mockResolvedValue({ status: "passed" });

  it("should execute the matching rule based on accessor", async () => {
    const rules = {
      admin: mockPass,
      user: mockFail,
    };
    const matcher = match((user: { role: string }) => user.role, rules);
    await matcher({ role: "admin" });

    expect(mockPass).toHaveBeenCalledWith({ role: "admin" }, undefined);
    expect(mockFail).not.toHaveBeenCalled();
  });

  it("should return the matched rule result", async () => {
    const rules = {
      admin: mockPass,
      user: mockFail,
    };
    const matcher = match((user: { role: string }) => user.role, rules);
    const result = await matcher({ role: "admin" });

    expect(result).toEqual({ status: "passed" });
  });

  it("should use default case when no match found", async () => {
    const rules = {
      admin: mockPass,
    };
    const matcher = match(
      (user: { role: string }) => user.role,
      rules,
      mockFail,
    );
    await matcher({ role: "guest" });

    expect(mockFail).toHaveBeenCalledWith({ role: "guest" }, undefined);
  });

  it("should use default error when no match and no default rule", async () => {
    const rules = {
      admin: mockPass,
    };
    const matcher = match((user: { role: string }) => user.role, rules);
    const result = await matcher({ role: "guest" });

    expect(result).toEqual({
      status: "failed",
      error: "No matching rule for key: guest",
    });
  });

  it("should work with custom error types", async () => {
    interface CustomError {
      code: number;
      message: string;
    }
    const customError: CustomError = { code: 404, message: "Not found" };

    const matcher = match<{ id: number }, CustomError>(
      (item) => (item.id > 100 ? "special" : "normal"),
      {
        special: mockPass,
      },
      customError,
    );

    const result = await matcher({ id: 50 });
    expect(result).toEqual({
      status: "failed",
      error: customError,
    });
  });

  it("should pass context to matched rules", async () => {
    const rules = {
      admin: mockPass,
    };
    const context = { auth: true };
    const matcher = match((user: { role: string }) => user.role, rules);
    await matcher({ role: "admin" }, context);

    expect(mockPass).toHaveBeenCalledWith({ role: "admin" }, context);
  });

  it("should handle async accessor functions", async () => {
    const rules = {
      admin: mockPass,
    };
    const matcher = match(async (user: { role: string }) => {
      await Promise.resolve();
      return user.role;
    }, rules);
    await matcher({ role: "admin" });

    expect(mockPass).toHaveBeenCalled();
  });

  it("should work with numeric keys", async () => {
    const rules = {
      1: mockPass,
      2: mockFail,
    };
    const matcher = match((item: { code: number }) => item.code, rules);
    await matcher({ code: 1 });

    expect(mockPass).toHaveBeenCalled();
  });

  it("should work with symbol keys", async () => {
    const TEST_SYMBOL = Symbol("test");
    const rules = {
      [TEST_SYMBOL]: mockPass,
    };
    const matcher = match(() => TEST_SYMBOL, rules);
    await matcher({});

    expect(mockPass).toHaveBeenCalled();
  });

  it("should handle default case as error string", async () => {
    const rules = {
      admin: mockPass,
    };
    const matcher = match(
      (user: { role: string }) => user.role,
      rules,
      "Invalid role",
    );
    const result = await matcher({ role: "guest" });

    expect(result).toEqual({
      status: "failed",
      error: "Invalid role",
    });
  });

  it("should handle default case as Rule", async () => {
    const rules = {
      admin: mockPass,
    };
    const matcher = match(
      (user: { role: string }) => user.role,
      rules,
      mockAsyncPass,
    );
    await matcher({ role: "guest" });

    expect(mockAsyncPass).toHaveBeenCalled();
  });

  it("should maintain type safety with complex inputs", async () => {
    interface ComplexInput {
      nested: {
        value: string;
        items: number[];
      };
    }

    const complexRule: Rule<ComplexInput> = () =>
      Promise.resolve({ status: "passed" });

    const matcher = match((input: ComplexInput) => input.nested.value, {
      test: complexRule,
    });

    const result = await matcher({
      nested: {
        value: "test",
        items: [1, 2, 3],
      },
    });

    expect(result.status).toBe("passed");
  });
});

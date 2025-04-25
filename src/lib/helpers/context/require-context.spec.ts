import { describe, vi, beforeEach, it, expect } from "vitest";
import { fail, pass } from "../result";
import { requireContextRule } from "./require-context";

describe("requireContextRule", () => {
  type UserContext = { userId: string };
  type FullContext = UserContext & { db: any };

  const mockRule = vi.fn((_: unknown, _ctx: UserContext) => pass());
  const errorMsg = "Context required";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass when context exists", async () => {
    const rule = requireContextRule(errorMsg, mockRule);
    const context = { userId: "123" };

    await rule({}, context);
    expect(mockRule).toHaveBeenCalledWith({}, context);
  });

  it("should fail with specified error when context is missing", async () => {
    const rule = requireContextRule(errorMsg, mockRule);
    const result = await rule({});

    expect(result).toEqual(fail(errorMsg));
    expect(mockRule).not.toHaveBeenCalled();
  });

  it("should support custom context checks", async () => {
    const isFullContext = (ctx: any): ctx is FullContext =>
      !!ctx?.userId && !!ctx?.db;

    const rule = requireContextRule(
      "DB context required",
      (_, ctx) => {
        ctx.db.query(); // Safe access
        return pass();
      },
      isFullContext,
    );

    // Test with partial context
    expect(await rule({}, { userId: "123" })).toEqual(
      fail("DB context required"),
    );

    // Test with full context
    expect(
      await rule({}, { userId: "123", db: { query: () => "USER" } }),
    ).toEqual({ status: "passed" });
  });
});

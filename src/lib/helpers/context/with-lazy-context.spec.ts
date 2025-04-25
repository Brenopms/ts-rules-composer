import { describe, vi, beforeEach, it, expect } from "vitest";
import { Rule } from "../../types";
import { fail, pass } from "../result";
import { withLazyContext } from "./with-lazy-context";

describe("withLazyContext", () => {
  const mockLoader = vi.fn();
  const mockRule = vi.fn(() => pass());

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoader.mockResolvedValue({ db: {} });
    mockRule.mockReturnValue(pass());
  });

  it("should load context and pass it to rule", async () => {
    const context = { userId: 123 };
    const loader = vi.fn().mockResolvedValue(context);
    const rule = vi.fn(() => pass());

    const lazyRule = withLazyContext(loader, rule);
    await lazyRule({ some: "input" });

    expect(loader).toHaveBeenCalledWith({ some: "input" });
    expect(rule).toHaveBeenCalledWith({ some: "input" }, context);
  });

  it("should return rule result", async () => {
    const expectedResult = fail("Test error");
    const rule = vi.fn().mockReturnValue(expectedResult);
    const lazyRule = withLazyContext(() => ({}), rule);

    const result = await lazyRule({});
    expect(result).toEqual(expectedResult);
  });

  it("should handle sync context loading", async () => {
    const context = { apiKey: "xyz" };
    const lazyRule = withLazyContext(
      () => context,
      (_, ctx) => (ctx?.apiKey === "xyz" ? pass() : fail("Invalid")),
    );

    const result = await lazyRule({});
    expect(result.status).toBe("passed");
  });

  it("should convert loader errors to failed results", async () => {
    const lazyRule = withLazyContext(
      () => Promise.reject(new Error("DB down")),
      () => pass(),
    );

    const result = await lazyRule({});
    expect(result).toEqual(fail("DB down"));
  });

  it("should preserve input types", async () => {
    type StrictInput = { id: string };
    type LooseInput = { other: number };

    const typedRule: Rule<StrictInput, string, { db: any }> = () => pass();

    // Valid usage - should pass
    const validLoader = (input: StrictInput) => ({ db: input.id });
    withLazyContext(validLoader, typedRule);

    // Invalid usage - should fail type check
    const invalidLoader = (input: LooseInput) => ({ db: input.other });

    // @ts-expect-error - This should now properly fail
    withLazyContext(invalidLoader, typedRule);
  });
});

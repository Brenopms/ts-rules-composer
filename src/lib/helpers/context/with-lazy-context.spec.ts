import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rule } from "../../types";
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
    expect(result).toBe(expectedResult);
  });

  it("forwards a caught failure from the rule by identity", async () => {
    const caughtResult = {
      outcome: "failed",
      error: "down",
      caughtCause: new Error("down"),
    } as const;
    const lazyRule = withLazyContext(
      () => ({}),
      () => caughtResult,
    );

    expect(await lazyRule({})).toBe(caughtResult);
  });

  it("should handle sync context loading", async () => {
    const context = { apiKey: "xyz" };
    const lazyRule = withLazyContext(
      () => context,
      (_, ctx) => (ctx?.apiKey === "xyz" ? pass() : fail("Invalid")),
    );

    const result = await lazyRule({});
    expect(result.outcome).toBe("passed");
  });

  it("should convert loader errors to caught failures (cause = the rejection)", async () => {
    const outage = new Error("DB down");
    const lazyRule = withLazyContext(
      () => Promise.reject(outage),
      () => pass(),
    );

    const result = await lazyRule({});
    expect(result).toStrictEqual({
      outcome: "failed",
      error: "DB down",
      caughtCause: outage,
    });
    expect(result.outcome === "failed" && result.caughtCause).toBe(outage);
  });

  it("marks a synchronous loader throw with the thrown value as cause", async () => {
    const outage = new Error("config missing");
    const lazyRule = withLazyContext(
      () => {
        throw outage;
      },
      () => pass(),
    );

    const result = await lazyRule({});
    expect(result.outcome === "failed" && result.caughtCause).toBe(outage);
  });

  it("should use a generic message when the loader throws a non-Error", async () => {
    const lazyRule = withLazyContext(
      () => Promise.reject("not an Error"),
      () => pass(),
    );

    const result = await lazyRule({});

    expect(result).toStrictEqual({
      outcome: "failed",
      error: "Context loading failed",
      caughtCause: "not an Error",
    });
  });

  it("should convert an async rule rejection to a caught failure", async () => {
    const outage = new Error("rule service down");
    const lazyRule = withLazyContext(
      () => ({}),
      async () => Promise.reject(outage),
    );

    const result = await lazyRule({});
    expect(result).toStrictEqual({
      outcome: "failed",
      error: "rule service down",
      caughtCause: outage,
    });
    expect(result.outcome === "failed" && result.caughtCause).toBe(outage);
  });

  it("should use the generic message when an async rule rejects with a non-Error", async () => {
    const lazyRule = withLazyContext(
      () => ({}),
      async () => Promise.reject("not an Error"),
    );

    await expect(lazyRule({})).resolves.toStrictEqual({
      outcome: "failed",
      error: "Context loading failed",
      caughtCause: "not an Error",
    });
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

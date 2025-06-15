import { describe, it, expect, vi, beforeEach } from "vitest";
import { getNormalizedRule } from "./get-normalized-rule";
import type { Rule, SafetyOptions } from "../../types";
import { pass, fail } from "../../helpers";

describe("getNormalizedRule", () => {
  // Mock rules for testing
  interface CustomError {
    code: number;
    message: string;
  }

  const passingRule: Rule<string> = vi.fn(() => pass());

  const errorThrowingRuleCustom: Rule<string, CustomError> = vi.fn(() => {
    throw new Error("Boom!");
  });
  const passingRuleCustom: Rule<string, CustomError> = vi.fn(() =>
    pass(),
  ) as Rule<string, CustomError>;
  const failingRuleCustom: Rule<string, CustomError> = vi.fn(() =>
    fail({ code: 400, message: "Expected error" }),
  );

  const errorThrowingRule: Rule<string> = vi.fn(() => {
    throw new Error("Boom!");
  });
  const objectThrowingRule: Rule<string, { code: number }> = vi.fn(() => {
    throw { code: 500 };
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("with errorHandlingMode = 'safe' (default)", () => {
    const defaultOptions: SafetyOptions = {};

    it("should return original rule when it doesn't throw", async () => {
      const normalized = getNormalizedRule(passingRule, defaultOptions);
      const result = await normalized("test");

      expect(result).toEqual(pass());
      expect(passingRule).toHaveBeenCalledWith("test", undefined);
    });

    it("should wrap with withSafeError when rule throws", async () => {
      const normalized = getNormalizedRule(errorThrowingRule, defaultOptions);
      const result = await normalized("test");

      expect(result.status).toBe("failed");
      expect((result as any).error.message).toBe("Boom!");
    });
  });

  describe("with errorHandlingMode = 'unsafe'", () => {
    const unsafeOptions: SafetyOptions = { errorHandlingMode: "unsafe" };

    it("should return original rule when it doesn't throw", async () => {
      const normalized = getNormalizedRule(passingRule, unsafeOptions);
      const result = await normalized("test");

      expect(result).toEqual(pass());
      expect(passingRule).toHaveBeenCalledWith("test");
    });

    it("should not catch thrown errors", async () => {
      // Create a fresh mock that throws when called
      const throwingRule: Rule<string> = vi.fn(() => {
        throw new Error("Boom!");
      });

      const normalized = getNormalizedRule(throwingRule, unsafeOptions);
      expect(async () => await normalized("test")).rejects.toThrow("Boom!");

      expect(throwingRule).toHaveBeenCalledWith("test");
    });

    it("should preserve original error throwing behavior", async () => {
      const normalized = getNormalizedRule(objectThrowingRule, unsafeOptions);

      expect(async () => await normalized("test")).rejects.toEqual({
        code: 500,
      });
    });
  });

  describe("with custom errorTransform", () => {
    const customTransform = vi.fn(
      (error: unknown): CustomError => ({
        code: 500,
        message: String(error),
      }),
    );

    const transformOptions: SafetyOptions<CustomError> = {
      errorTransform: customTransform,
    };

    it("should use custom transform for thrown errors", async () => {
      const normalized = getNormalizedRule(
        errorThrowingRuleCustom,
        transformOptions,
      );
      const result = await normalized("test");

      expect(result).toEqual(
        fail({
          code: 500,
          message: "Error: Boom!",
        }),
      );
      expect(customTransform).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should not call transform for successful rules", async () => {
      const normalized = getNormalizedRule(passingRuleCustom, transformOptions);
      await normalized("test");

      expect(customTransform).not.toHaveBeenCalled();
    });

    it("should not call transform for explicit failures", async () => {
      const normalized = getNormalizedRule(failingRuleCustom, transformOptions);
      await normalized("test");

      expect(customTransform).not.toHaveBeenCalled();
    });

    it("should use default string error when no transform provided", async () => {
      const stringErrorRule: Rule<string> = vi.fn(() => {
        throw new Error("Boom!");
      });

      const normalized = getNormalizedRule(stringErrorRule, {});
      const result = await normalized("test");

      expect(result).toEqual(fail(new Error("Boom!")));
    });
  });

  describe("edge cases", () => {
    it("should handle null/undefined input safely", async () => {
      const normalized = getNormalizedRule(passingRule, {});
      await expect(normalized(null as any)).resolves.not.toThrow();
      await expect(normalized(undefined as any)).resolves.not.toThrow();
    });

    it("should handle rules that return invalid results", async () => {
      const invalidRule = vi.fn(() => "not a RuleResult" as any);
      const normalized = getNormalizedRule(invalidRule, {});
      const result = await normalized("test");

      expect(result.status).toBe("failed");
      expect((result as any).error.message).toContain(
        "Invalid rule - did not return RuleResult",
      );
    });

    it("should pass context to wrapped rules", async () => {
      const context = { userId: 123 };
      const contextAwareRule = vi.fn((_: string, ctx: any) =>
        ctx?.userId === 123 ? pass() : fail("Wrong user"),
      );

      const normalized = getNormalizedRule(contextAwareRule, {});
      await normalized("test", context);

      expect(contextAwareRule).toHaveBeenCalledWith("test", context);
    });
  });

  describe("type safety", () => {
    it("should maintain input type safety", () => {
      type StrictInput = { id: string };
      const typedRule: Rule<StrictInput> = () => pass();

      // Should compile
      getNormalizedRule(typedRule, {})({ id: "123" });

      // @ts-expect-error - Should fail if input types don't match
      getNormalizedRule(typedRule, {})({ notId: "123" });
    });

    it("should maintain error type safety", async () => {
      interface CustomError {
        code: number;
        details: string;
      }
      const customErrorRule: Rule<string, CustomError> = () => {
        throw new Error("Test");
      };

      const normalized = getNormalizedRule(customErrorRule, {
        errorTransform: (e) => ({
          code: 500,
          details: String(e),
        }),
      });

      const result = await normalized("test");
      expect(result.status).toBe("failed");
      expect((result as any).error).toMatchObject({
        code: expect.any(Number),
        details: expect.any(String),
      });
    });
  });
});

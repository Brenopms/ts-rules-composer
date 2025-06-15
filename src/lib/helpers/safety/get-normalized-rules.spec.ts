import { describe, it, expect, vi, beforeEach } from "vitest";
import { getNormalizedRules } from "./get-normalized-rules";
import type { Rule, SafetyOptions } from "../../types";
import { pass, fail } from "../../helpers";
import { withSafeError } from "../../combinators";

describe("getNormalizedRules", () => {
  // Mock rules for testing
  interface CustomError {
    code: number;
    message: string;
  }

  const passingRule: Rule<string> = vi.fn(() => pass());
  const failingRule: Rule<string> = vi.fn(() => fail("Expected error"));
  const errorThrowingRule: Rule<string> = vi.fn(() => {
    throw new Error("Boom!");
  });
  const objectThrowingRule: Rule<string, { code: number }> = vi.fn(() => {
    throw { code: 500 };
  });

  const passingRuleCustom: Rule<string, CustomError> = vi.fn(() =>
    pass(),
  ) as Rule<string, CustomError>;
  const failingRuleCustom: Rule<string, CustomError> = vi.fn(() =>
    fail({ code: 400, message: "Expected error" }),
  );
  const errorThrowingRuleCustom: Rule<string, CustomError> = vi.fn(() => {
    throw new Error("Boom!");
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("with errorHandlingMode = 'safe' (default)", () => {
    const defaultOptions: SafetyOptions = {};

    it("should return original rules when they don't throw", async () => {
        const rules = [passingRule, passingRule];
        const normalized = getNormalizedRules(rules, defaultOptions);
        
        expect(normalized).toHaveLength(2);
        
        // Verify behavior instead of function reference
        const result1 = await normalized[0]("test");
        expect(result1).toEqual(pass());
        expect(passingRule).toHaveBeenCalledWith("test", undefined);
        
        const result2 = await normalized[1]("test");
        expect(result2).toEqual(pass());
        expect(passingRule).toHaveBeenCalledWith("test", undefined);
      });
      it("should wrap throwing rules with safe handlers", async () => {
        const rules = [errorThrowingRule];
        const normalized = getNormalizedRules(rules, defaultOptions);
        
        const result = await normalized[0]("test");
        expect(result.status).toBe("failed");
        expect((result as any).error.message).toBe("Boom!");
      });

    it("should handle empty rules array", () => {
      const normalized = getNormalizedRules([], defaultOptions);
      expect(normalized).toEqual([]);
    });
  });

  describe("with errorHandlingMode = 'unsafe'", () => {
    const unsafeOptions: SafetyOptions = { errorHandlingMode: "unsafe" };

    it("should return original rules without wrapping", () => {
      const rules = [passingRule, errorThrowingRule, objectThrowingRule];
      const normalized = getNormalizedRules(rules, unsafeOptions);

      expect(normalized).toEqual(rules);
    });

    it("should preserve custom error types", () => {
      const rules = [passingRuleCustom, errorThrowingRuleCustom];
      const normalized = getNormalizedRules(rules, unsafeOptions);

      expect(normalized).toEqual(rules);
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

    it("should apply transform to throwing rules", async () => {
      const rules = [errorThrowingRuleCustom];
      const normalized = getNormalizedRules(rules, transformOptions);
      
      // Test behavior instead of function reference
      const result = await normalized[0]("test");
      expect(result.status).toBe("failed");
      expect((result as any).error).toEqual({
        code: 500,
        message: "Error: Boom!"
      });
      expect(customTransform).toHaveBeenCalled();
    });

    it("should not transform non-throwing rules", async () => {
      const rules = [passingRuleCustom];
      const normalized = getNormalizedRules(rules, transformOptions);
      
      // Test behavior instead of function reference
      const result = await normalized[0]("test");
      expect(result).toEqual(pass());
      expect(customTransform).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle null/undefined rules array", () => {
      expect(getNormalizedRules(null as any, {})).toEqual([]);
      expect(getNormalizedRules(undefined as any, {})).toEqual([]);
    });

    it("should pass context through to normalized rules", async () => {
      const context = { userId: 123 };
      const contextAwareRule: Rule<string> = vi.fn((_, ctx) =>
        ctx?.userId === 123 ? pass() : fail("Wrong context"),
      );

      const normalized = getNormalizedRules([contextAwareRule], {});
      await normalized[0]("test", context);

      expect(contextAwareRule).toHaveBeenCalledWith("test", context);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { withSafePredicate } from "./with-safe-predicate";

describe("withSafePredicate", () => {
  const mockPredicate = vi.fn();
  const mockErrorTransform = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockErrorTransform.mockImplementation((e) => `Transformed: ${String(e)}`);
  });

  describe("Basic functionality", () => {
    it("should pass through boolean results (true)", async () => {
      mockPredicate.mockResolvedValue(true);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result).toEqual({ status: "passed", value: true });
      expect(mockPredicate).toHaveBeenCalledWith("test", undefined);
    });

    it("should pass through boolean results (false)", async () => {
      mockPredicate.mockResolvedValue(false);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result).toEqual({ status: "passed", value: false });
    });

    it("should handle sync predicates", async () => {
      mockPredicate.mockReturnValue(true);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result).toEqual({ status: "passed", value: true });
    });
  });

  describe("Error handling", () => {
    it("should catch thrown errors", async () => {
      mockPredicate.mockImplementation(() => {
        throw new Error("Boom!");
      });
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error).toEqual(new Error("Boom!"));
    });

    it("should catch rejected promises", async () => {
      mockPredicate.mockRejectedValue(new Error("Async boom!"));
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error).toEqual(new Error("Async boom!"));
    });

    it("should handle non-Error throws", async () => {
      mockPredicate.mockImplementation(() => {
        throw "String error";
      });
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error).toBe("String error");
    });

    it("should use custom error transform", async () => {
      mockPredicate.mockRejectedValue(new Error("Original"));
      const safePred = withSafePredicate(mockPredicate, mockErrorTransform);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error).toBe("Transformed: Error: Original");
      expect(mockErrorTransform).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("Type safety enforcement", () => {
    it("should fail on non-boolean returns (undefined)", async () => {
      mockPredicate.mockResolvedValue(undefined);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error.message).toContain(
        "Predicate must return boolean",
      );
    });

    it("should fail on non-boolean returns (object)", async () => {
      mockPredicate.mockResolvedValue({ not: "boolean" });
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error.message).toContain("got object");
    });

    it("should fail on non-boolean returns (null)", async () => {
      mockPredicate.mockResolvedValue(null);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error.message).toContain("got object");
    });
  });

  describe("Context handling", () => {
    it("should pass context to predicate", async () => {
      const context = { auth: true };
      mockPredicate.mockResolvedValue(true);
      const safePred = withSafePredicate(mockPredicate);
      await safePred("test", context);

      expect(mockPredicate).toHaveBeenCalledWith("test", context);
    });

    it("should handle undefined context", async () => {
      mockPredicate.mockResolvedValue(true);
      const safePred = withSafePredicate(mockPredicate);
      await safePred("test");

      expect(mockPredicate).toHaveBeenCalledWith("test", undefined);
    });
  });

  describe("Edge cases", () => {
    it("should handle custom error types", async () => {
      interface CustomError {
        code: number;
        details: string;
      }
      const errorTransform = (e: unknown): CustomError => ({
        code: 500,
        details: String(e),
      });

      mockPredicate.mockRejectedValue(new Error("Test"));
      const safePred = withSafePredicate(mockPredicate, errorTransform);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error).toEqual({
        code: 500,
        details: "Error: Test",
      });
    });

    it("should preserve object error structure when configured", async () => {
      const originalError = { code: 400, message: "Bad request" };
      mockPredicate.mockRejectedValue(originalError);

      // No transform - should preserve object structure
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error).toEqual(originalError);
    });

    it("should handle falsy values (empty string)", async () => {
      mockPredicate.mockImplementation(() => "");
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.status).toBe("failed");
      expect((result as any).error.message).toContain("got string");
    });
  });
});

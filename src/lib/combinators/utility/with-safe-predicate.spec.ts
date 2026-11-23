import { beforeEach, describe, expect, it, vi } from "vitest";
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

      expect(result).toEqual({ outcome: "passed", value: true });
      expect(mockPredicate).toHaveBeenCalledWith("test", undefined);
    });

    it("should pass through boolean results (false)", async () => {
      mockPredicate.mockResolvedValue(false);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result).toEqual({ outcome: "passed", value: false });
    });

    it("should handle sync predicates", async () => {
      mockPredicate.mockReturnValue(true);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result).toEqual({ outcome: "passed", value: true });
    });
  });

  describe("Error handling", () => {
    it("should catch thrown errors", async () => {
      mockPredicate.mockImplementation(() => {
        throw new Error("Boom!");
      });
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.outcome).toBe("failed");
      expect((result as any).error).toEqual(new Error("Boom!"));
    });

    it("should catch rejected promises", async () => {
      mockPredicate.mockRejectedValue(new Error("Async boom!"));
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.outcome).toBe("failed");
      expect((result as any).error).toEqual(new Error("Async boom!"));
    });

    it("should handle non-Error throws", async () => {
      mockPredicate.mockImplementation(() => {
        throw "String error";
      });
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.outcome).toBe("failed");
      expect((result as any).error).toBe("String error");
    });

    it("should use custom error transform", async () => {
      mockPredicate.mockRejectedValue(new Error("Original"));
      const safePred = withSafePredicate(mockPredicate, mockErrorTransform);
      const result = await safePred("test");

      expect(result.outcome).toBe("failed");
      expect((result as any).error).toBe("Transformed: Error: Original");
      expect(mockErrorTransform).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("Type safety enforcement", () => {
    it("should fail on non-boolean returns (undefined)", async () => {
      mockPredicate.mockResolvedValue(undefined);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.outcome).toBe("failed");
      expect((result as any).error.message).toContain(
        "Predicate must return boolean",
      );
    });

    it("should fail on non-boolean returns (object)", async () => {
      mockPredicate.mockResolvedValue({ not: "boolean" });
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.outcome).toBe("failed");
      expect((result as any).error.message).toContain("got object");
    });

    it("should fail on non-boolean returns (null)", async () => {
      mockPredicate.mockResolvedValue(null);
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.outcome).toBe("failed");
      expect((result as any).error.message).toContain("got object");
    });
  });

  // Caught failures carry their cause (rule-error-provenance)
  describe("caughtCause", () => {
    const causeOf = (result: object) =>
      (result as { caughtCause?: unknown }).caughtCause;

    it("marks a thrown error with the thrown value by identity", async () => {
      const boom = new Error("Boom!");
      const result = await withSafePredicate(() => {
        throw boom;
      })("test");

      expect(result).toStrictEqual({
        outcome: "failed",
        error: boom,
        caughtCause: boom,
      });
      expect(causeOf(result)).toBe(boom);
    });

    it("marks a rejection with the rejected value by identity", async () => {
      const reason = { code: 503 };
      const result = await withSafePredicate(() => Promise.reject(reason))(
        "test",
      );

      expect(Object.hasOwn(result, "caughtCause")).toBe(true);
      expect(causeOf(result)).toBe(reason);
    });

    it("marks `throw undefined` with an own undefined cause", async () => {
      const result = await withSafePredicate(() => {
        throw undefined;
      })("test");

      expect(result).toStrictEqual({
        outcome: "failed",
        error: "undefined",
        caughtCause: undefined,
      });
      expect(Object.hasOwn(result, "caughtCause")).toBe(true);
    });

    it.each([true, false])("leaves a %s result unmarked", async (value) => {
      const result = await withSafePredicate(() => value)("test");

      expect(result).toStrictEqual({ outcome: "passed", value });
    });

    it("marks a non-boolean with the diagnostic Error it builds", async () => {
      const payload = { code: "TRANSFORMED" };
      const transform = vi.fn((_error: unknown) => payload);

      const result = await withSafePredicate(
        () => "yes" as unknown as boolean,
        transform,
      )("test");

      expect(transform).toHaveBeenCalledOnce();
      const recorded = transform.mock.calls[0]?.[0];
      expect(recorded).toStrictEqual(
        new Error("Predicate must return boolean, got string"),
      );
      expect((result as { error: unknown }).error).toBe(payload);
      expect(causeOf(result)).toBe(recorded);
    });

    it("marks with the transform's exception when it throws inside the try", async () => {
      const transformError = new Error("transform failed");
      const transform = vi
        .fn<(error: unknown) => string>()
        .mockImplementationOnce(() => {
          throw transformError;
        })
        .mockImplementation((error) => `handled: ${String(error)}`);

      const result = await withSafePredicate(
        () => 1 as unknown as boolean,
        transform,
      )("test");

      expect(transform).toHaveBeenCalledTimes(2);
      expect(transform.mock.calls[1]?.[0]).toBe(transformError);
      expect(result).toStrictEqual({
        outcome: "failed",
        error: "handled: Error: transform failed",
        caughtCause: transformError,
      });
    });

    it("lets a transform that throws in the catch escape", async () => {
      const transformError = new Error("transform failed");
      const safePred = withSafePredicate(
        () => {
          throw new Error("Boom!");
        },
        () => {
          throw transformError;
        },
      );

      await expect(safePred("test")).rejects.toBe(transformError);
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

      expect(result.outcome).toBe("failed");
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

      expect(result.outcome).toBe("failed");
      expect((result as any).error).toEqual(originalError);
    });

    it("should handle falsy values (empty string)", async () => {
      mockPredicate.mockImplementation(() => "");
      const safePred = withSafePredicate(mockPredicate);
      const result = await safePred("test");

      expect(result.outcome).toBe("failed");
      expect((result as any).error.message).toContain("got string");
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { tap } from "./tap";
import { pass } from "../../helpers";
import { pipeRules } from "../../composition";

describe("tap", () => {
  const mockEffect = vi.fn();
  const mockContext = { requestId: "123" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Basic functionality
  it("should execute effect without modifying validation result", async () => {
    const input = { id: "test" };
    const rule = tap(mockEffect);
    const result = await rule(input);

    expect(result).toEqual(pass());
    expect(mockEffect).toHaveBeenCalledWith(input, undefined);
  });

  // 2. Context handling
  it("should pass context to the effect", async () => {
    const input = { id: "test" };
    const rule = tap(mockEffect);
    await rule(input, mockContext);

    expect(mockEffect).toHaveBeenCalledWith(input, mockContext);
  });

  // 3. Error isolation
  it("should not propagate effect errors", async () => {
    const errorEffect = vi.fn().mockRejectedValue(new Error("Effect failed"));
    const input = { id: "test" };
    const rule = tap(errorEffect);

    await expect(rule(input)).resolves.toEqual(pass());
    expect(errorEffect).toHaveBeenCalled();
  });

  // 4. Async effects
  it("should handle async effects", async () => {
    const asyncEffect = vi.fn().mockImplementation(async (input: any) => {
      await Promise.resolve();
      console.log(input);
    });
    const input = { id: "test" };
    const rule = tap(asyncEffect);

    await expect(rule(input)).resolves.toEqual(pass());
    expect(asyncEffect).toHaveBeenCalledWith(input, undefined);
  });

  // 5. Integration with pipeRules
  it("should work in composition pipelines", async () => {
    const mockRule = vi.fn().mockResolvedValue(pass());
    const input = { id: "test" };
    const pipeline = pipeRules([tap(mockEffect), mockRule]);

    await pipeline(input);
    expect(mockEffect).toHaveBeenCalledBefore(mockRule);
    expect(mockRule).toHaveBeenCalledWith(input, undefined);
  });

  // 6. Type safety tests
  it("should enforce input type matching", async () => {
    type StrictInput = { id: string };
    const typedEffect = vi.fn((_: StrictInput) => {});

    // Valid usage
    tap(typedEffect)({ id: "123" });

    // @ts-expect-error - Should fail if input types mismatch
    tap(typedEffect)({ notId: "123" });
  });

  // 8. Effect error handling
  it("should log effect errors to console", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("Test error");
    const errorEffect = vi.fn().mockRejectedValue(error);
    const rule = tap(errorEffect);

    await rule({});
    expect(consoleSpy).toHaveBeenCalledWith("Tap effect failed: ", error);
    consoleSpy.mockRestore();
  });

  // 9. Multiple taps in pipeline
  it("should allow multiple taps in sequence", async () => {
    const effect1 = vi.fn();
    const effect2 = vi.fn();
    const input = { id: "test" };

    const pipeline = pipeRules([tap(effect1), tap(effect2)]);

    await pipeline(input);
    expect(effect1).toHaveBeenCalledBefore(effect2);
  });
});

import { describe, vi, beforeEach, it, expect } from "vitest";
import { fail, pass } from "../../helpers";
import { Rule } from "../../types";
import { retry } from "./retry";

describe("retry combinator", () => {
  const successOnThirdTry = vi
    .fn()
    .mockImplementationOnce(() => fail("First error"))
    .mockImplementationOnce(() => fail("Second error"))
    .mockImplementationOnce(() => pass());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should succeed if rule eventually passes", async () => {
    const rule = retry(successOnThirdTry, { attempts: 3, delayMs: 10 });
    const result = await rule({});

    expect(result).toEqual(pass());
    expect(successOnThirdTry).toHaveBeenCalledTimes(3);
  });

  it("should fail after max attempts", async () => {
    const alwaysFails = vi.fn(() => fail("Persistent error"));
    const rule = retry(alwaysFails, { attempts: 2, delayMs: 10 });
    const result = await rule({});

    expect(result).toEqual(fail("MAX_RETRIES_EXCEEDED"));
    expect(alwaysFails).toHaveBeenCalledTimes(2);
  });

  it("should use shouldRetry predicate", async () => {
    const mockRule = vi
      .fn()
      .mockImplementationOnce(() => ({
        status: "failed",
        error: "First error",
      }))
      .mockImplementationOnce(() => ({
        status: "failed",
        error: "Second error",
      }));

    const shouldRetry = vi
      .fn()
      .mockReturnValueOnce(true) // Retry first error
      .mockReturnValue(false); // Don't retry second

    const rule = retry(mockRule, { attempts: 3, shouldRetry, delayMs: 10 });
    const result = await rule({});

    expect(result).toEqual({ status: "failed", error: "Second error" });
    expect(shouldRetry).toHaveBeenCalledWith("First error", 1);
    expect(mockRule).toHaveBeenCalledTimes(2);
  });
  it("should pass context to each attempt", async () => {
    const context = { userId: 123 };
    const rule = retry(successOnThirdTry, { attempts: 2, delayMs: 10 });
    await rule({}, context);

    expect(successOnThirdTry).toHaveBeenCalledWith({}, context);
  });

  // Type safety tests
  it("should preserve input types", () => {
    type StrictInput = { id: string };
    const typedRule: Rule<StrictInput, string> = () => pass();

    // Valid usage
    retry(typedRule, { attempts: 2 });

    // @ts-expect-error - Should fail if input types mismatch
    retry((input: { other: number }) => pass(), { attempts: 2, delayMs: 10 })({ id: "123" });
  });

  it('should handle thrown errors', async () => {
    const errorRule = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ status: 'passed' }); // Second attempt succeeds
  
    const rule = retry(errorRule, { 
      attempts: 2,
      shouldRetry: (e) => (e as Error).message === 'Network error'
    });
    
    const result = await rule({});
    expect(result).toEqual({ status: 'passed' });
  });
  
  
  it('should fail on non-retryable thrown errors', async () => {
    const errorRule = vi.fn()
      .mockRejectedValue(new Error('Fatal'));
  
    const rule = retry(errorRule, { 
      shouldRetry: (e) => (e as Error).message !== 'Fatal'
    });
    
    const result = await rule({});
    expect(result).toEqual({ 
      status: 'failed', 
      error: new Error('Fatal') 
    });
  });
});

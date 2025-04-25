import { describe, beforeEach, it, expect, vi } from 'vitest';
import { fail } from '../../helpers/result/fail';
import { pass } from '../../helpers/result/pass';
import { Rule } from '../../types/rule';
import { oneOf } from './one-of';

describe('oneOf combinator', () => {
  const passingRule = vi.fn(() => pass());
  const failingRule1 = vi.fn(() => fail("Error 1"));
  const failingRule2 = vi.fn(() => fail("Error 2"));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass if any rule passes', async () => {
    const validator = oneOf(failingRule1, passingRule, failingRule2);
    const result = await validator({});
    
    expect(result).toEqual(pass());
    expect(failingRule1).toHaveBeenCalled();
    expect(passingRule).toHaveBeenCalled();
    expect(failingRule2).not.toHaveBeenCalled(); // Short-circuits
  });

  it('should fail with all errors if no rules pass', async () => {
    const validator = oneOf(failingRule1, failingRule2);
    const result = await validator({});
    
    expect(result).toEqual(fail(["Error 1", "Error 2"]));
  });

  it('should handle empty rules array', async () => {
    const validator = oneOf();
    const result = await validator({});
    
    expect(result).toEqual(pass()); // Vacuous truth
  });

  it('should pass context to all rules', async () => {
    const context = { userId: 123 };
    const rule = vi.fn(() => pass());
    
    await oneOf(rule)({}, context);
    expect(rule).toHaveBeenCalledWith({}, context);
  });

  it('should work with async rules', async () => {
    const asyncRule = vi.fn(async () => {
      await Promise.resolve();
      return pass();
    });
    
    const result = await oneOf(asyncRule)({});
    expect(result).toEqual(pass());
  });

  // Type safety tests
  it('should enforce rule type matching', () => {
    type StrictInput = { id: string };
    const typedRule: Rule<StrictInput, string> = () => pass();
    
    // Valid usage
    oneOf(typedRule, () => fail("Error"));
    
    // @ts-expect-error - Should fail if input types mismatch
    oneOf(typedRule, (input: { other: number }) => pass());
  });
});
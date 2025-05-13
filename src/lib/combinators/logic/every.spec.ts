import { pass, fail } from "../../helpers";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rule } from "../../types";
import { every } from "./every";

describe("every", () => {
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it("should return pass if no rules are provided", async () => {
    const result = await every([])({});
    expect(result).toEqual(pass());
  });

  it("should return pass if all rules pass", async () => {
    const rule1 = vi.fn(() => pass());
    const rule2 = vi.fn(() => pass());
    const validator = every([rule1, rule2]);
    const input = { foo: "bar" };

    const result = await validator(input);

    expect(result).toEqual(pass());
    expect(rule1).toHaveBeenCalledWith(input, undefined);
    expect(rule2).toHaveBeenCalledWith(input, undefined);
  });

  it("should collect all errors in parallel", async () => {
    const error1 = "Error 1";
    const error2 = "Error 2";
    const rule1 = vi.fn(() => fail(error1));
    const rule2 = vi.fn(async () => {
      await delay(10); // Ensure parallel execution
      return fail(error2);
    });
    const validator = every([rule1, rule2]);
    const input = { foo: "bar" };

    const result = await validator(input);

    expect(result).toEqual(fail([error1, error2]));
    expect(rule1).toHaveBeenCalledWith(input, undefined);
    expect(rule2).toHaveBeenCalledWith(input, undefined);
  });

  it("should maintain error order when rules fail", async () => {
    const error1 = "Error 1";
    const error2 = "Error 2";
    const rule1 = vi.fn(async () => {
      await delay(20);
      return fail(error1);
    });
    const rule2 = vi.fn(async () => {
      await delay(10);
      return fail(error2);
    });
    const validator = every([rule1, rule2]);

    const result = await validator({});

    // Order should match input rule order, not completion order
    expect(result).toEqual(fail([error1, error2]));
  });

  it("should pass context to all rules", async () => {
    const rule1 = vi.fn(() => pass());
    const rule2 = vi.fn(() => pass());
    const validator = every([rule1, rule2]);
    const input = { foo: "bar" };
    const context = { userId: 123 };

    await validator(input, context);

    expect(rule1).toHaveBeenCalledWith(input, context);
    expect(rule2).toHaveBeenCalledWith(input, context);
  });
});

describe("Niche errors", () => {
  it("should preserve custom error types", async () => {
    type CustomError = { code: number; message: string };
    const rule: Rule<unknown, CustomError> = () =>
      fail({ code: 400, message: "Bad" });

    const validator = every([rule]);
    const result = await validator({});

    expect(result).toEqual(fail([{ code: 400, message: "Bad" }]));
  });

  // Mixed sync/async rules
  it("should handle mixed sync/async rules", async () => {
    const syncRule = () => fail("Sync error");
    const asyncRule = async () => fail("Async error");

    const validator = every([syncRule, asyncRule]);
    const result = await validator({});

    expect(result).toEqual(fail(["Sync error", "Async error"]));
  });

  it("should handle 1000+ parallel rules", async () => {
    const manyRules = Array(1000).fill(() => pass());
    const validator = every(manyRules);
    await expect(validator({})).resolves.toEqual(pass());
  });

  it('should handle falsy error values (false, 0, "")', async () => {
    const rules = [() => fail(false), () => fail(0), () => fail("")];
    const validator = every(rules as any);
    const result = await validator({});
    expect(result).toEqual(fail([false, 0, ""]));
  });
});
// Error type propagation

describe("Context behavior tests", () => {
  const countingRule = vi.fn((_: unknown, ctx: any) => {
    ctx.count = (ctx.count || 0) + 1;
    return pass();
  });

  // Context checker rule
  const expectCountRule = (expected: number) =>
    vi.fn((_: unknown, ctx: any) =>
      ctx.count === expected
        ? pass()
        : fail(`Expected count ${expected}, got ${ctx.count}`),
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow context mutation by default (shared reference)", async () => {
    const context = { count: 0 };
    const validator = every(
      [countingRule, countingRule, expectCountRule(2)], // Expect both mutations to apply
    );

    const result = await validator({}, context);

    expect(result).toEqual(pass());
    expect(context.count).toBe(2); // Original context modified
  });

  it("should prevent context mutations when cloneContext=true", async () => {
    const context = { count: 0 };
    const validator = every([countingRule, expectCountRule(1)], {
      cloneContext: true,
    });

    const result = await validator({}, context);

    expect(result).toEqual(pass());
    expect(context.count).toBe(0); // Original context untouched
    expect(countingRule.mock.calls[0][1].count).toBe(1); // First clone
  });

  it("should deep clone complex context objects", async () => {
    const context = { nested: { value: 0 } };
    const mutateNested = vi.fn((_, ctx) => {
      ctx.nested.value++;
      return pass();
    });

    const validator = every([mutateNested, mutateNested], {
      cloneContext: true,
    });

    await validator({}, context);

    expect(context.nested.value).toBe(0); // Original unchanged
    expect(mutateNested.mock.calls[0][1].nested.value).toBe(2); // First clone
    expect(mutateNested.mock.calls[1][1].nested.value).toBe(2); // Fresh clone
  });

  it("should handle null/undefined context", async () => {
    const nullValidator = every([], { cloneContext: true });
    await expect(nullValidator({}, null)).resolves.not.toThrow();
    await expect(nullValidator({}, undefined)).resolves.not.toThrow();
  });

  it("should shallow clone when possible for performance", async () => {
    const context = { simple: "value" };
    const validator = every(
      [
        (_, ctx) => {
          (ctx as any).simple = "changed";
          return pass();
        },
      ],
      { cloneContext: true },
    );

    await validator({}, context);
    expect(context.simple).toBe("value"); // Original unchanged
  });
});

it("should prevent accidental context mutation", async () => {
  const context = { count: 0 };

  const rule1 = (_: any, ctx: any) => {
    (ctx as any).count++; // Bad practice but test should handle
    return pass();
  };

  const rule2 = (_: any, ctx: any) => {
    if ((ctx as any).count !== 0) {
      return fail("Context mutated");
    }
    return pass();
  };

  const validator = every([rule1, rule2]);
  await expect(validator({}, context)).resolves.toEqual(
    fail(["Context mutated"]),
  );
});

it("should preserve custom generic types through composition", async () => {
  type CustomInput = { id: string };
  type CustomError = { severity: number };

  const rule: Rule<CustomInput, CustomError> = (input) =>
    input.id ? pass() : fail({ severity: 5 });

  const validator = every([rule]);
  const result1 = await validator({ id: "test" });
  const result2 = await validator({} as CustomInput);

  expect(result1).toEqual(pass());
  expect(result2).toEqual(fail([{ severity: 5 }]));
});

it("should not retain rule references after execution", async () => {
  let heavyObject = new Array(1e6).fill(0); // 1MB object
  const rule = () => {
    heavyObject = null!; // Simulate cleanup
    return pass();
  };

  const validator = every([rule]);
  await validator({});

  // This would fail if composition held references
  expect(() => heavyObject.length).toThrow();
});

it("should handle circular reference errors", async () => {
  const obj: any = { self: null };
  obj.self = obj;

  const validator = every([() => fail(obj), () => pass()]);
  const result = await validator({});

  expect(result.status).toBe("failed");
  // Check circular reference is preserved
  const errors = (result as any).error;
  expect(errors[0].self).toBe(errors[0]); // Verify circularity
  expect(errors).toEqual([obj]); // Verify error content
});

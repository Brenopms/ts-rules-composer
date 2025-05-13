import { composeRules } from "./compose-rules";
import { fail, pass } from "../helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rule } from "../types";

describe("composeRules", () => {
  const alwaysPass = vi.fn(() => pass());
  const failWithMsg = (msg: string) => vi.fn(() => fail(msg));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return pass if no rules are provided", async () => {
    const result = await composeRules([])({});
    expect(result).toEqual(pass());
  });

  it("should return pass if all rules pass", async () => {
    const rule1 = alwaysPass;
    const rule2 = alwaysPass;
    const validator = composeRules([rule1, rule2]);
    const input = { foo: "bar" };

    const result = await validator(input);

    expect(result).toEqual(pass());
    expect(rule2).toHaveBeenCalledWith(input, undefined); // called last
    expect(rule1).toHaveBeenCalledWith(input, undefined); // called first
  });

  it("should fail fast on first failure (right-to-left)", async () => {
    const errorMsg = "First error";
    const rule1 = failWithMsg(errorMsg);
    const rule2 = alwaysPass;
    const validator = composeRules([rule2, rule1]); // rule1 runs first (right-to-left)

    const result = await validator({});

    expect(result).toEqual(fail(errorMsg));
    expect(rule1).toHaveBeenCalled();
    expect(rule2).not.toHaveBeenCalled(); // skipped
  });

  it("should pass context to all rules", async () => {
    const rule1 = vi.fn(() => pass());
    const rule2 = vi.fn(() => pass());
    const validator = composeRules([rule1, rule2]);
    const context = { some: "ctx" };
    await validator({}, context);
    expect(rule1).toHaveBeenCalledWith({}, context);
    expect(rule2).toHaveBeenCalledWith({}, context);
  });

  it("should preserve custom error types", async () => {
    type CustomError = { code: number };
    const rule: Rule<unknown, CustomError> = () => fail({ code: 123 });

    const validator = composeRules([rule]);
    const result = await validator({});

    expect(result).toEqual(fail({ code: 123 }));
  });

  it("should handle 1000+ rules without stack overflow", async () => {
    const manyRules = Array(1000).fill(() => pass());
    const validator = composeRules(manyRules);
    await expect(validator({})).resolves.toEqual(pass());
  });

  describe("Context behavior tests", () => {
    const countingRule = vi.fn((_: unknown, ctx: any) => {
      ctx.count = (ctx.count || 0) + 1;
      return pass();
    });

    const expectCountRule = (expected: number) =>
      vi.fn((_: unknown, ctx: any) =>
        ctx.count === expected
          ? pass()
          : fail(`Expected count ${expected}, got ${ctx.count}`),
      );

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should allow context mutation by default", async () => {
      const context = { count: 0 };
      const validator = composeRules([
        expectCountRule(2),
        countingRule,
        countingRule,
      ]);

      const result = await validator({}, context);
      expect(result).toEqual(pass());
      expect(context.count).toBe(2);
    });

    it("should prevent context mutations when cloneContext=true", async () => {
      const context = { count: 0 };
      const validator = composeRules([expectCountRule(1), countingRule], {
        cloneContext: true,
      });

      const result = await validator({}, context);
      expect(result).toEqual(pass());
      expect(context.count).toBe(0);
    });

    it("should deep clone complex context", async () => {
      const context = { nested: { value: 0 } };
      const mutateNested = vi.fn((_, ctx) => {
        ctx.nested.value++;
        return pass();
      });

      const validator = composeRules([mutateNested, mutateNested], {
        cloneContext: true,
      });

      await validator({}, context);

      expect(context.nested.value).toBe(0);
      expect(mutateNested.mock.calls[0][1].nested.value).toBe(2);
      expect(mutateNested.mock.calls[1][1].nested.value).toBe(2);
    });

    it("should handle null/undefined context safely", async () => {
      const validator = composeRules([], { cloneContext: true });
      await expect(validator({}, null)).resolves.not.toThrow();
      await expect(validator({}, undefined)).resolves.not.toThrow();
    });

    it("should shallow clone flat objects", async () => {
      const context = { simple: "abc" };
      const validator = composeRules(
        [
          (_, ctx: any) => {
            ctx.simple = "modified";
            return pass();
          },
        ],
        { cloneContext: true },
      );

      await validator({}, context);
      expect(context.simple).toBe("abc");
    });
  });

  it("should prevent accidental context mutation", async () => {
    const context = { count: 0 };

    const rule1 = (_: any, ctx: any) => {
      ctx.count++;
      return pass();
    };

    const rule2 = (_: any, ctx: any) => {
      if (ctx.count !== 0) {
        return fail("Context mutated");
      }
      return pass();
    };

    const validator = composeRules([rule2, rule1]);
    const result = await validator({}, context);
    expect(result).toEqual(fail("Context mutated"));
  });

  it("should preserve custom generics", async () => {
    type Input = { id: string };
    type Error = { level: number };

    const rule: Rule<Input, Error> = (input) =>
      input.id ? pass() : fail({ level: 2 });

    const validator = composeRules([rule]);

    const valid = await validator({ id: "1" });
    const invalid = await validator({} as Input);

    expect(valid).toEqual(pass());
    expect(invalid).toEqual(fail({ level: 2 }));
  });

  it("should not retain rule references post-execution", async () => {
    let heavy = new Array(1e6).fill("x");
    const rule = () => {
      heavy = null!;
      return pass();
    };

    const validator = composeRules([rule]);
    await validator({});

    expect(() => heavy.length).toThrow();
  });

  it("should handle circular reference errors", async () => {
    const obj: any = { self: null };
    obj.self = obj;

    const validator = composeRules([() => fail(obj)]);
    const result = await validator({});
    expect(result.status).toBe("failed");
    expect((result as any).error.self).toBe((result as any).error);
  });
});

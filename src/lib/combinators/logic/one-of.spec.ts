import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, pass } from "../../helpers";
import type { Rule, RuleResult } from "../../types";
import { oneOf } from "./one-of";
import {
  caught,
  caughtAt,
  children,
  expectResult,
} from "./three-valued.fixtures";

describe("oneOf combinator", () => {
  const passingRule = vi.fn(() => pass());
  const failingRule1 = vi.fn(() => fail("Error 1"));
  const failingRule2 = vi.fn(() => fail("Error 2"));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should pass if any rule passes", async () => {
    const validator = oneOf([failingRule1, passingRule, failingRule2]);
    const result = await validator({});

    expect(result).toEqual(pass());
    expect(failingRule1).toHaveBeenCalled();
    expect(passingRule).toHaveBeenCalled();
    expect(failingRule2).not.toHaveBeenCalled(); // Short-circuits
  });

  it("should fail with all errors if no rules pass", async () => {
    const validator = oneOf([failingRule1, failingRule2]);
    const result = await validator({});

    expect(result).toEqual(fail(["Error 1", "Error 2"]));
  });

  it("should handle empty rules array", async () => {
    const validator = oneOf([]);
    const result = await validator({});

    expect(result).toEqual(pass()); // Vacuous truth
  });

  it("should pass context to all rules", async () => {
    const context = { userId: 123 };
    const rule = vi.fn(() => pass());

    await oneOf([rule])({}, context);
    expect(rule).toHaveBeenCalledWith({}, context);
  });

  it("should work with async rules", async () => {
    const asyncRule = vi.fn(async () => {
      await Promise.resolve();
      return pass();
    });

    const result = await oneOf([asyncRule])({});
    expect(result).toEqual(pass());
  });

  // Type safety tests
  it("should enforce rule type matching", () => {
    type StrictInput = { id: string };
    const typedRule: Rule<StrictInput, string> = () => pass();

    // Valid usage
    oneOf([typedRule, () => fail("Error")]);

    // @ts-expect-error - Should fail if input types mismatch
    oneOf(typedRule, (input: { other: number }) => pass());
  });
});

describe("oneOf three-valued (caughtCause)", () => {
  const outage = new Error("down");
  const down: Rule<unknown> = () => {
    throw outage;
  };

  it.each<[string, RuleResult<unknown>]>([
    ["TT", pass()],
    ["TF", pass()],
    ["TU", pass()],
    ["FT", pass()],
    ["FF", fail(["f0", "f1"])],
    ["FU", caught(["f0", "u1"], 1)],
    ["UT", pass()],
    ["UF", caught(["u0", "f1"], 0)],
    ["UU", caught(["u0", "u1"], 0)],
  ])("%s", async (cells, expected) => {
    expectResult(await oneOf(children(cells))({}), expected);
  });

  it("stops at a pass before a caught child", async () => {
    const later = vi.fn(() => caughtAt(1));

    expect(await oneOf([() => pass(), later])({})).toStrictEqual(pass());
    expect(later).not.toHaveBeenCalled();
  });

  it("marks a throw it caught itself, payload from errorTransform", async () => {
    const result = await oneOf([down, () => fail("denied")], {
      errorTransform: () => "mapped",
    })({});

    expectResult(result, {
      outcome: "failed",
      error: ["mapped", "denied"],
      caughtCause: outage,
    });
  });

  it("marks throw undefined with an own undefined cause", async () => {
    const result = await oneOf([
      () => {
        throw undefined;
      },
    ])({});

    expect(result.outcome).toBe("failed");
    expect(Object.hasOwn(result, "caughtCause")).toBe(true);
    expect((result as { caughtCause?: unknown }).caughtCause).toBeUndefined();
  });

  it("keeps a child's marker in unsafe mode", async () => {
    const result = await oneOf(children("FU"), {
      errorHandlingMode: "unsafe",
    })({});

    expectResult(result, caught(["f0", "u1"], 1));
  });
});

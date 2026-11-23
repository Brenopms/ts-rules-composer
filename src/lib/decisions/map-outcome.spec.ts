import { describe, expect, it, vi } from "vitest";
import { withSafeError } from "../combinators";
import { pipeRules } from "../composition";
import { fail, pass } from "../helpers";
import type { Rule } from "../types";
import { defineOutcomes } from "./define-outcomes";

interface App {
  age: number;
}
const app: App = { age: 30 };

const thrownBy = (build: () => unknown): unknown => {
  try {
    build();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
};

const makeCredit = (onErrorCaught?: (error: unknown) => void) =>
  defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
    onErrorCaught,
  });

const passes: Rule<App> = () => pass();
const fails: Rule<App, { code: string }> = () => fail({ code: "UNDERAGE" });

describe("toolkit.mapOutcome mapping", () => {
  it("maps a failed rule to mapping.failed", async () => {
    const decide = makeCredit().mapOutcome(fails, { failed: "declined" });

    expect(await decide(app)).toStrictEqual({ outcome: "declined" });
  });

  it("maps a passed rule to the last declared outcome by default", async () => {
    const decide = makeCredit().mapOutcome(passes, { failed: "declined" });

    expect(await decide(app)).toStrictEqual({ outcome: "approved" });
  });

  it("maps a passed rule to mapping.passed when given", async () => {
    const decide = makeCredit().mapOutcome(passes, {
      failed: "declined",
      passed: "review",
    });

    expect(await decide(app)).toStrictEqual({ outcome: "review" });
  });

  it("uses the default when mapping.passed is explicitly undefined", async () => {
    const decide = makeCredit().mapOutcome(passes, {
      failed: "declined",
      passed: undefined,
    });

    expect(await decide(app)).toStrictEqual({ outcome: "approved" });
  });

  it("defaults passed to the last outcome of a binary toolkit", async () => {
    const binary = defineOutcomes(["failed", "passed"], { onError: "failed" });

    const decide = binary.mapOutcome(passes, { failed: "failed" });

    expect(await decide(app)).toStrictEqual({ outcome: "passed" });
  });

  it("maps an async rule", async () => {
    const decide = makeCredit().mapOutcome(async () => fail("late"), {
      failed: "declined",
    });

    expect(await decide(app)).toStrictEqual({ outcome: "declined" });
  });

  it("passes the input and context to the rule", async () => {
    const rule = vi.fn((_app: App, _context?: { tenant: string }) => pass());
    const context = { tenant: "eu" };

    await makeCredit().mapOutcome(rule, { failed: "declined" })(app, context);

    expect(rule).toHaveBeenCalledExactlyOnceWith(app, context);
  });

  it("drops the rule's error and returns a fresh result each run", async () => {
    const decide = makeCredit().mapOutcome(fails, { failed: "declined" });

    const first = await decide(app);
    const second = await decide(app);

    expect(first).toStrictEqual({ outcome: "declined" });
    expect(Object.keys(first)).toEqual(["outcome"]);
    expect(first).not.toBe(second);
  });

  it("reads the rule result's outcome once", async () => {
    let reads = 0;
    const result = {
      get outcome() {
        reads++;
        return reads === 1 ? "failed" : "passed";
      },
    };
    const decide = makeCredit().mapOutcome(() => result as never, {
      failed: "declined",
    });

    expect(await decide(app)).toStrictEqual({ outcome: "declined" });
    expect(reads).toBe(1);
  });

  it("is not affected by changing the mapping after construction", async () => {
    const mapping: { failed: "declined" | "review" } = { failed: "declined" };
    const decide = makeCredit().mapOutcome(fails, mapping);

    mapping.failed = "review";

    expect(await decide(app)).toStrictEqual({ outcome: "declined" });
  });
});

describe("toolkit.mapOutcome failures", () => {
  const boom = new Error("boom");

  it.each<[string, () => unknown, (error: unknown) => void]>([
    [
      "throws",
      () => {
        throw boom;
      },
      (error) => expect(error).toBe(boom),
    ],
    [
      "rejects",
      () => Promise.reject(boom),
      (error) => expect(error).toBe(boom),
    ],
    [
      "returns null",
      () => null,
      (error) =>
        expect(error).toStrictEqual(
          new TypeError("rule must return an object with an own outcome"),
        ),
    ],
    [
      "returns an object without an outcome",
      () => ({}),
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
    [
      "returns an inherited outcome",
      () => Object.create({ outcome: "passed" }),
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
    [
      "returns a destination outcome instead of passed or failed",
      () => ({ outcome: "approved" }),
      (error) =>
        expect(error).toStrictEqual(
          new TypeError(
            'rule returned "approved", which is not "passed" or "failed"',
          ),
        ),
    ],
    [
      "returns a non-string outcome",
      () => ({ outcome: 1 }),
      (error) =>
        expect(error).toStrictEqual(
          new TypeError(
            'rule returned (number), which is not "passed" or "failed"',
          ),
        ),
    ],
  ])(
    "gives onError and calls the hook once when the rule %s",
    async (_, rule, checkError) => {
      const hook = vi.fn();
      const decide = makeCredit(hook).mapOutcome(rule as Rule<App>, {
        failed: "declined",
        passed: "approved",
      });

      expect(await decide(app)).toStrictEqual({ outcome: "review" });
      expect(hook).toHaveBeenCalledOnce();
      checkError(hook.mock.calls[0]?.[0]);
    },
  );

  it("uses the onError override", async () => {
    const decide = makeCredit().mapOutcome(
      () => {
        throw boom;
      },
      { failed: "approved" },
      { onError: "declined" },
    );

    expect(await decide(app)).toStrictEqual({ outcome: "declined" });
  });

  it("still gives onError when the hook throws", async () => {
    const decide = makeCredit(() => {
      throw new Error("hook");
    }).mapOutcome(() => Promise.reject(boom), { failed: "declined" });

    expect(await decide(app)).toStrictEqual({ outcome: "review" });
  });
});

describe("toolkit.mapOutcome caught failures (caughtCause)", () => {
  const outage = new Error("down");
  const throwing: Rule<App> = () => {
    throw outage;
  };

  it("gives onError and calls the hook once with the cause by identity", async () => {
    const hook = vi.fn();
    const decide = makeCredit(hook).mapOutcome(withSafeError(throwing), {
      failed: "declined",
    });

    expect(await decide(app)).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0]?.[0]).toBe(outage);
  });

  it("reaches a pipe's caught child", async () => {
    const hook = vi.fn();
    const decide = makeCredit(hook).mapOutcome(pipeRules([passes, throwing]), {
      failed: "declined",
    });

    expect(await decide(app)).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0]?.[0]).toBe(outage);
  });

  it("uses the onError override", async () => {
    const decide = makeCredit().mapOutcome(
      withSafeError(throwing),
      { failed: "approved" },
      { onError: "declined" },
    );

    expect(await decide(app)).toStrictEqual({ outcome: "declined" });
  });

  it("treats an own undefined cause as caught", async () => {
    const hook = vi.fn();
    const decide = makeCredit(hook).mapOutcome(
      () => ({ outcome: "failed", error: "e", caughtCause: undefined }),
      { failed: "declined" },
    );

    expect(await decide(app)).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it.each<[string, () => unknown, "declined" | "approved"]>([
    ["a business failure", () => fail("Too young"), "declined"],
    [
      "an inherited cause",
      () =>
        Object.assign(Object.create({ caughtCause: outage }), {
          outcome: "failed",
          error: "e",
        }),
      "declined",
    ],
    [
      "a passed result with an own cause",
      () => ({ outcome: "passed", caughtCause: outage }),
      "approved",
    ],
  ])("maps %s without calling the hook", async (_, rule, expected) => {
    const hook = vi.fn();
    const decide = makeCredit(hook).mapOutcome(rule as Rule<App>, {
      failed: "declined",
    });

    expect(await decide(app)).toStrictEqual({ outcome: expected });
    expect(hook).not.toHaveBeenCalled();
  });

  it("gives onError, never a rejection, when the caughtCause getter throws", async () => {
    const getterError = new Error("getter");
    const hook = vi.fn();
    const result = {
      outcome: "failed",
      error: "e",
      get caughtCause(): unknown {
        throw getterError;
      },
    };
    const decide = makeCredit(hook).mapOutcome(() => result as never, {
      failed: "declined",
    });

    await expect(decide(app)).resolves.toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledExactlyOnceWith(getterError);
  });
});

describe("toolkit.mapOutcome construction", () => {
  const credit = makeCredit();

  it.each<[string, () => unknown, string]>([
    [
      "rule is not a function",
      () => credit.mapOutcome("isAdult" as never, { failed: "declined" }),
      "mapOutcome: rule must be a function",
    ],
    [
      "rule is missing, before checking the mapping",
      () => credit.mapOutcome(undefined as never, null as never),
      "mapOutcome: rule must be a function",
    ],
    [
      "mapping is not an object",
      () => credit.mapOutcome(passes, "declined" as never),
      "mapOutcome: mapping must be an object",
    ],
    [
      "mapping.failed is missing",
      () => credit.mapOutcome(passes, {} as never),
      "mapOutcome: mapping.failed is required",
    ],
    [
      "mapping.failed is not a declared outcome",
      () => credit.mapOutcome(passes, { failed: "decline" as never }),
      'mapOutcome: mapping.failed "decline" is not a declared outcome',
    ],
    [
      "mapping.passed is not a declared outcome",
      () =>
        credit.mapOutcome(passes, {
          failed: "declined",
          passed: "passed" as never,
        }),
      'mapOutcome: mapping.passed "passed" is not a declared outcome',
    ],
    [
      "the onError override is not a declared outcome",
      () =>
        credit.mapOutcome(
          passes,
          { failed: "declined" },
          { onError: "unknown" as never },
        ),
      'mapOutcome: onError "unknown" is not a declared outcome',
    ],
  ])("throws a TypeError when %s", (_, build, message) => {
    const error = thrownBy(build);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe(message);
  });

  it("reads each mapping property and option once, at construction", async () => {
    const reads: string[] = [];
    const mapping = {
      get failed() {
        reads.push("failed");
        return "declined" as const;
      },
      get passed() {
        reads.push("passed");
        return "approved" as const;
      },
    };
    const options = {
      get onError() {
        reads.push("onError");
        return "declined" as const;
      },
    };

    const decide = credit.mapOutcome(passes, mapping, options);
    await decide(app);
    await decide(app);

    expect([...reads].sort()).toEqual(["failed", "onError", "passed"]);
  });
});

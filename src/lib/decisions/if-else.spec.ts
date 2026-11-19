import { describe, expect, it, vi } from "vitest";
import type { Decision } from "../types";
import { defineOutcomes } from "./define-outcomes";

interface App {
  age: number;
}
type CreditOutcome = "declined" | "review" | "approved";

const thrownBy = (build: () => unknown): unknown => {
  try {
    build();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
};

/** Its string conversion throws, so a message must not coerce it. */
const unprintable = {
  toString: () => {
    throw new RangeError("cannot print");
  },
};

const makeCredit = (onErrorCaught?: (error: unknown) => void) =>
  defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
    onErrorCaught,
  });

const decisionOf =
  (outcome: CreditOutcome): Decision<App, CreditOutcome> =>
  () => ({ outcome });

describe("toolkit.ifElse routing", () => {
  it("runs only whenTrue when the predicate returns true", async () => {
    const credit = makeCredit();
    const whenTrue = vi.fn(decisionOf("declined"));
    const whenFalse = vi.fn(decisionOf("approved"));

    const result = await credit.ifElse(
      () => true,
      whenTrue,
      whenFalse,
    )({
      age: 30,
    });

    expect(result).toStrictEqual({ outcome: "declined" });
    expect(whenTrue).toHaveBeenCalledOnce();
    expect(whenFalse).not.toHaveBeenCalled();
  });

  it("runs only whenFalse when the predicate returns false", async () => {
    const credit = makeCredit();
    const whenTrue = vi.fn(decisionOf("declined"));
    const whenFalse = vi.fn(decisionOf("approved"));

    const result = await credit.ifElse(
      () => false,
      whenTrue,
      whenFalse,
    )({
      age: 30,
    });

    expect(result).toStrictEqual({ outcome: "approved" });
    expect(whenTrue).not.toHaveBeenCalled();
    expect(whenFalse).toHaveBeenCalledOnce();
  });

  it("turns bare-string branches into their outcome", async () => {
    const credit = makeCredit();
    const decide = credit.ifElse(
      (app: App) => app.age >= 18,
      "approved",
      "declined",
    );

    expect(await decide({ age: 30 })).toStrictEqual({ outcome: "approved" });
    expect(await decide({ age: 16 })).toStrictEqual({ outcome: "declined" });
  });

  it("awaits an async predicate and an async decision branch", async () => {
    const credit = makeCredit();
    // "approved" is neither the other branch nor the fallback ("review"),
    // so a callback that isn't awaited can't pass by accident.
    const decide = credit.ifElse(
      async () => true,
      async () => ({ outcome: "approved" as const }),
      "declined",
    );

    expect(await decide({ age: 30 })).toStrictEqual({ outcome: "approved" });
  });

  it("forwards input and context to the predicate and the branch", async () => {
    const credit = makeCredit();
    const predicate = vi.fn(() => true);
    const whenTrue = vi.fn(decisionOf("approved"));
    const input = { age: 30 };
    const context = { tenant: "eu" };

    await credit.ifElse<App, { tenant: string }>(
      predicate,
      whenTrue,
      "declined",
    )(input, context);

    expect(predicate).toHaveBeenCalledWith(input, context);
    expect(whenTrue).toHaveBeenCalledWith(input, context);
  });

  it("returns a fresh { outcome } without the branch's extra fields", async () => {
    const credit = makeCredit();
    const branchResult = { outcome: "approved" as const, score: 720 };

    const result = await credit.ifElse(
      () => true,
      () => branchResult,
      "declined",
    )({ age: 30 });

    expect(result).toStrictEqual({ outcome: "approved" });
    expect(result).not.toBe(branchResult);
  });

  it("returns a fresh object for a bare-string branch on every run", async () => {
    const credit = makeCredit();
    const decide = credit.ifElse(() => true, "approved", "declined");

    expect(await decide({ age: 30 })).not.toBe(await decide({ age: 30 }));
  });
});

describe("toolkit.ifElse failures", () => {
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
      'returns "false"',
      () => "false",
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
    ["returns 1", () => 1, (error) => expect(error).toBeInstanceOf(TypeError)],
    [
      "returns undefined",
      () => undefined,
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
  ])(
    "gives onError and runs no branch when the predicate %s",
    async (_, predicate, checkError) => {
      const hook = vi.fn();
      const credit = makeCredit(hook);
      const whenTrue = vi.fn(decisionOf("approved"));
      const whenFalse = vi.fn(decisionOf("approved"));

      const result = await credit.ifElse(
        predicate as () => boolean,
        whenTrue,
        whenFalse,
      )({ age: 30 });

      expect(result).toStrictEqual({ outcome: "review" });
      expect(whenTrue).not.toHaveBeenCalled();
      expect(whenFalse).not.toHaveBeenCalled();
      expect(hook).toHaveBeenCalledOnce();
      checkError(hook.mock.calls[0]?.[0]);
    },
  );

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
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
    [
      "returns no outcome key",
      () => ({}),
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
    [
      "returns an inherited outcome",
      () => Object.create({ outcome: "approved" }),
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
    [
      "returns an out-of-set label",
      () => ({ outcome: "aproved" }),
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
  ])(
    "gives onError when a decision branch %s",
    async (_, branch, checkError) => {
      const hook = vi.fn();
      const credit = makeCredit(hook);

      const result = await credit.ifElse(
        () => true,
        branch as Decision<App, CreditOutcome>,
        "approved",
      )({ age: 30 });

      expect(result).toStrictEqual({ outcome: "review" });
      expect(hook).toHaveBeenCalledOnce();
      checkError(hook.mock.calls[0]?.[0]);
    },
  );

  it("passes a TypeError to the hook for an out-of-set outcome whose conversion throws", async () => {
    const hook = vi.fn();
    const credit = makeCredit(hook);

    const result = await credit.ifElse(
      () => true,
      (() => ({ outcome: unprintable })) as never,
      "approved",
    )({ age: 30 });

    expect(result).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
  });

  it("calls onErrorCaught before the outcome is returned", async () => {
    const order: string[] = [];
    const credit = makeCredit(() => order.push("hook"));

    const decide = credit.ifElse(
      () => {
        throw boom;
      },
      "approved",
      "declined",
    );

    await Promise.resolve(decide({ age: 30 })).then(() => order.push("result"));

    expect(order).toEqual(["hook", "result"]);
  });

  it("swallows a throwing onErrorCaught without changing the outcome", async () => {
    const credit = makeCredit(() => {
      throw new Error("hook failed");
    });

    const result = await credit.ifElse(
      () => {
        throw boom;
      },
      "approved",
      "declined",
    )({ age: 30 });

    expect(result).toStrictEqual({ outcome: "review" });
  });

  it("swallows a rejecting onErrorCaught without changing the outcome", async () => {
    const credit = makeCredit(async () => {
      throw new Error("hook failed");
    });

    const result = await credit.ifElse(
      () => {
        throw boom;
      },
      "approved",
      "declined",
    )({ age: 30 });

    expect(result).toStrictEqual({ outcome: "review" });
  });

  it("uses the onError override instead of the toolkit onError", async () => {
    const credit = makeCredit();

    const result = await credit.ifElse(
      () => {
        throw boom;
      },
      "approved",
      "approved",
      { onError: "declined" },
    )({ age: 30 });

    expect(result).toStrictEqual({ outcome: "declined" });
  });

  it("applies a nested override only to the nested ifElse's own callbacks", async () => {
    const credit = makeCredit();
    const throwing = () => {
      throw boom;
    };
    const innerWithOverride = credit.ifElse(
      () => true,
      "approved",
      "approved",
      {
        onError: "declined",
      },
    );
    const innerFailing = credit.ifElse(throwing, "approved", "approved");

    const outerFails = credit.ifElse(throwing, innerWithOverride, "approved");
    const innerFails = credit.ifElse(() => true, innerFailing, "approved", {
      onError: "declined",
    });

    expect(await outerFails({ age: 30 })).toStrictEqual({ outcome: "review" });
    expect(await innerFails({ age: 30 })).toStrictEqual({ outcome: "review" });
  });
});

describe("toolkit.ifElse construction", () => {
  const credit = makeCredit();
  const yes = () => true;

  it.each<[string, () => unknown, string]>([
    [
      "predicate is not a function",
      () => credit.ifElse(true as never, "approved", "declined"),
      "ifElse: predicate must be a function",
    ],
    [
      "predicate is missing, before checking the branches",
      () => credit.ifElse(undefined as never, "aproved" as never, "declined"),
      "ifElse: predicate must be a function",
    ],
    [
      "whenTrue is an unknown outcome",
      () => credit.ifElse(yes, "aproved" as never, "declined"),
      'ifElse: whenTrue "aproved" is not a declared outcome',
    ],
    [
      "whenFalse is an unknown outcome",
      () => credit.ifElse(yes, "approved", "declinde" as never),
      'ifElse: whenFalse "declinde" is not a declared outcome',
    ],
    [
      "whenTrue is neither an outcome nor a function",
      () => credit.ifElse(yes, 1 as never, "declined"),
      "ifElse: whenTrue must be a declared outcome or a decision function",
    ],
    [
      "whenFalse is missing",
      () => credit.ifElse(yes, "approved", undefined as never),
      "ifElse: whenFalse must be a declared outcome or a decision function",
    ],
    [
      "the onError override is not a declared outcome",
      () =>
        credit.ifElse(yes, "approved", "declined", {
          onError: "unknown" as never,
        }),
      'ifElse: onError "unknown" is not a declared outcome',
    ],
    [
      "the onError override is a non-string whose conversion throws",
      () =>
        credit.ifElse(yes, "approved", "declined", {
          onError: unprintable as never,
        }),
      "ifElse: onError (object) is not a declared outcome",
    ],
  ])("throws a TypeError when %s", (_, build, message) => {
    const error = thrownBy(build);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe(message);
  });
});

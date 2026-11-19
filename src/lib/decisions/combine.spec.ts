import { describe, expect, it, vi } from "vitest";
import type { Decision, Resolver } from "../types";
import { defineOutcomes } from "./define-outcomes";

interface App {
  score: number;
}
type CreditOutcome = "declined" | "review" | "approved";
const ORDER: readonly CreditOutcome[] = ["declined", "review", "approved"];

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

const decisionOf =
  (outcome: CreditOutcome): Decision<App, CreditOutcome> =>
  () => ({ outcome });

/** The default merge, for custom resolvers that only change one method. */
const strongest = (current: CreditOutcome, next: CreditOutcome) =>
  ORDER.indexOf(next) < ORDER.indexOf(current) ? next : current;

const app: App = { score: 650 };

describe("toolkit.combine sequential fold (default precedence)", () => {
  it.each<[CreditOutcome, CreditOutcome]>([
    ["review", "approved"],
    ["approved", "review"],
  ])("review beats approved (%s, %s)", async (first, second) => {
    const credit = makeCredit();

    const result = await credit.combine([
      decisionOf(first),
      decisionOf(second),
    ])(app);

    expect(result).toStrictEqual({ outcome: "review" });
  });

  it("stops after a first child returning declined (the top outcome)", async () => {
    const credit = makeCredit();
    const second = vi.fn(decisionOf("approved"));

    const result = await credit.combine([decisionOf("declined"), second])(app);

    expect(result).toStrictEqual({ outcome: "declined" });
    expect(second).not.toHaveBeenCalled();
  });

  it("still calls later children after review", async () => {
    const credit = makeCredit();
    const second = vi.fn(decisionOf("approved"));
    const third = vi.fn(decisionOf("declined"));

    const result = await credit.combine([decisionOf("review"), second, third])(
      app,
    );

    expect(result).toStrictEqual({ outcome: "declined" });
    expect(second).toHaveBeenCalledOnce();
    expect(third).toHaveBeenCalledOnce();
  });

  it("stops as soon as a later step reaches the top outcome", async () => {
    const credit = makeCredit();
    const third = vi.fn(decisionOf("approved"));

    const result = await credit.combine([
      decisionOf("approved"),
      decisionOf("declined"),
      third,
    ])(app);

    expect(result).toStrictEqual({ outcome: "declined" });
    expect(third).not.toHaveBeenCalled();
  });

  it("runs children one at a time, in order", async () => {
    const credit = makeCredit();
    const events: string[] = [];
    const child =
      (name: string, outcome: CreditOutcome): Decision<App, CreditOutcome> =>
      async () => {
        events.push(`start ${name}`);
        await Promise.resolve();
        events.push(`end ${name}`);
        return { outcome };
      };

    await credit.combine([child("a", "approved"), child("b", "approved")])(app);

    expect(events).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("forwards input and context to every child", async () => {
    const credit = makeCredit();
    const first = vi.fn(decisionOf("approved"));
    const second = vi.fn(decisionOf("approved"));
    const context = { tenant: "eu" };

    await credit.combine<App, { tenant: string }>([first, second])(
      app,
      context,
    );

    expect(first).toHaveBeenCalledWith(app, context);
    expect(second).toHaveBeenCalledWith(app, context);
  });

  it("turns a failing child into onError, which joins the merge", async () => {
    const hook = vi.fn();
    const credit = makeCredit(hook);
    const boom = new Error("boom");

    const result = await credit.combine([
      () => {
        throw boom;
      },
      decisionOf("declined"),
    ])(app);

    expect(result).toStrictEqual({ outcome: "declined" });
    expect(hook).toHaveBeenCalledExactlyOnceWith(boom);
  });

  it("turns a malformed child result into onError", async () => {
    const hook = vi.fn();
    const credit = makeCredit(hook);

    const result = await credit.combine([
      decisionOf("approved"),
      (() => ({ outcome: "aproved" })) as never,
    ])(app);

    expect(result).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
  });

  it("uses the onError override for a failing child", async () => {
    const credit = makeCredit();

    const result = await credit.combine(
      [() => Promise.reject(new Error("down")), decisionOf("approved")],
      { onError: "declined" },
    )(app);

    expect(result).toStrictEqual({ outcome: "declined" });
  });

  it("returns a fresh { outcome } without the child's extra fields", async () => {
    const credit = makeCredit();
    const childResult = { outcome: "approved" as const, score: 720 };

    const result = await credit.combine([() => childResult])(app);

    expect(result).toStrictEqual({ outcome: "approved" });
    expect(result).not.toBe(childResult);
  });

  it("reads each entry of the decisions array once, at construction", async () => {
    const credit = makeCredit();
    let reads = 0;
    const decisions = [decisionOf("approved")];
    Object.defineProperty(decisions, 0, {
      get: () => {
        reads++;
        return decisionOf("approved");
      },
    });
    const decide = credit.combine(decisions as [Decision<App, CreditOutcome>]);

    await decide(app);
    await decide(app);

    expect(reads).toBe(1);
  });

  it("is not affected by changing the decisions array after construction", async () => {
    const credit = makeCredit();
    const decisions: Decision<App, CreditOutcome>[] = [decisionOf("approved")];
    const decide = credit.combine(
      decisions as [
        Decision<App, CreditOutcome>,
        ...Decision<App, CreditOutcome>[],
      ],
    );

    decisions[0] = decisionOf("declined");
    decisions.push(decisionOf("declined"));

    expect(await decide(app)).toStrictEqual({ outcome: "approved" });
  });
});

describe("toolkit.combine custom resolvers", () => {
  it("lets a custom isFinal control stopping", async () => {
    const credit = makeCredit();
    const second = vi.fn(decisionOf("declined"));
    const resolver: Resolver<CreditOutcome> = {
      combine: strongest,
      isFinal: (current) => current === "review",
    };

    const result = await credit.combine([decisionOf("review"), second], {
      resolver,
    })(app);

    expect(result).toStrictEqual({ outcome: "review" });
    expect(second).not.toHaveBeenCalled();
  });

  it("runs every child when isFinal is never true", async () => {
    const credit = makeCredit();
    const second = vi.fn(decisionOf("approved"));

    const result = await credit.combine([decisionOf("declined"), second], {
      resolver: { combine: strongest, isFinal: () => false },
    })(app);

    expect(result).toStrictEqual({ outcome: "declined" });
    expect(second).toHaveBeenCalledOnce();
  });

  it("calls combine with (current, next) and isFinal with the result so far", async () => {
    const credit = makeCredit();
    const combine = vi.fn((_: CreditOutcome, next: CreditOutcome) => next);
    const isFinal = vi.fn((_: CreditOutcome) => false);

    const result = await credit.combine(
      [decisionOf("approved"), decisionOf("review"), decisionOf("declined")],
      { resolver: { combine, isFinal } },
    )(app);

    expect(result).toStrictEqual({ outcome: "declined" });
    expect(combine.mock.calls).toEqual([
      ["approved", "review"],
      ["review", "declined"],
    ]);
    expect(isFinal.mock.calls).toEqual([["approved"], ["review"]]);
  });

  it("does not call isFinal when no child is left", async () => {
    const credit = makeCredit();
    const isFinal = vi.fn(() => false);

    await credit.combine([decisionOf("approved")], {
      resolver: { combine: strongest, isFinal },
    })(app);

    expect(isFinal).not.toHaveBeenCalled();
  });

  it("calls a class-based resolver's methods with the resolver as this", async () => {
    class Strictest implements Resolver<CreditOutcome> {
      constructor(private readonly order: readonly CreditOutcome[]) {}
      combine(current: CreditOutcome, next: CreditOutcome): CreditOutcome {
        return this.order.indexOf(next) < this.order.indexOf(current)
          ? next
          : current;
      }
      isFinal(current: CreditOutcome): boolean {
        return current === this.order[0];
      }
    }
    const credit = makeCredit();

    const result = await credit.combine(
      [decisionOf("approved"), decisionOf("declined")],
      { resolver: new Strictest(ORDER) },
    )(app);

    // Without `this`, the methods throw and the result would be onError.
    expect(result).toStrictEqual({ outcome: "declined" });
  });

  it("reads each option and resolver method once, at construction", async () => {
    const credit = makeCredit();
    const reads: string[] = [];
    const resolver = {
      get combine() {
        reads.push("resolver.combine");
        return strongest;
      },
      get isFinal() {
        reads.push("resolver.isFinal");
        return () => false;
      },
    };
    const options = {
      get resolver() {
        reads.push("resolver");
        return resolver;
      },
      get onError() {
        reads.push("onError");
        return "declined" as const;
      },
    };

    const decide = credit.combine(
      [decisionOf("approved"), decisionOf("review")],
      options,
    );
    await decide(app);
    await decide(app);

    expect([...reads].sort()).toEqual([
      "onError",
      "resolver",
      "resolver.combine",
      "resolver.isFinal",
    ]);
  });
});

describe("toolkit.combine resolver failures", () => {
  const boom = new Error("boom");
  const throwing = () => {
    throw boom;
  };

  it.each<[string, Partial<Resolver<CreditOutcome>>, (error: unknown) => void]>(
    [
      [
        "combine throws",
        { combine: throwing },
        (error) => expect(error).toBe(boom),
      ],
      [
        "combine returns an out-of-set label",
        { combine: () => "aproved" as never },
        (error) => expect(error).toBeInstanceOf(TypeError),
      ],
      [
        "combine returns a promise",
        { combine: (async () => "declined") as never },
        (error) => expect(error).toBeInstanceOf(TypeError),
      ],
      [
        "combine returns a rejected promise",
        { combine: (() => Promise.reject(boom)) as never },
        (error) => expect(error).toBeInstanceOf(TypeError),
      ],
      [
        "isFinal throws",
        { isFinal: throwing },
        (error) => expect(error).toBe(boom),
      ],
      [
        'isFinal returns "false"',
        { isFinal: () => "false" as never },
        (error) => expect(error).toBeInstanceOf(TypeError),
      ],
      [
        "isFinal returns a promise",
        { isFinal: (async () => false) as never },
        (error) => expect(error).toBeInstanceOf(TypeError),
      ],
      [
        "isFinal returns a rejected promise",
        { isFinal: (() => Promise.reject(boom)) as never },
        (error) => expect(error).toBeInstanceOf(TypeError),
      ],
    ],
  )(
    "ends the whole combine with onError when %s, even if a later child would win",
    async (_, override, checkError) => {
      const hook = vi.fn();
      const credit = makeCredit(hook);
      const later = vi.fn(decisionOf("declined"));
      const resolver = {
        combine: strongest,
        isFinal: () => false,
        ...override,
      };

      const result = await credit.combine(
        [decisionOf("approved"), decisionOf("approved"), later],
        { resolver },
      )(app);

      expect(result).toStrictEqual({ outcome: "review" });
      expect(later).not.toHaveBeenCalled();
      expect(hook).toHaveBeenCalledOnce();
      checkError(hook.mock.calls[0]?.[0]);
    },
  );

  it("uses the onError override for a resolver failure", async () => {
    const credit = makeCredit();

    const result = await credit.combine(
      [decisionOf("approved"), decisionOf("approved")],
      {
        onError: "declined",
        resolver: { combine: throwing, isFinal: () => false },
      },
    )(app);

    expect(result).toStrictEqual({ outcome: "declined" });
  });

  it("calls onErrorCaught before the outcome is returned", async () => {
    const order: string[] = [];
    const credit = makeCredit(() => order.push("hook"));

    const decide = credit.combine(
      [decisionOf("approved"), decisionOf("approved")],
      { resolver: { combine: throwing, isFinal: () => false } },
    );
    await Promise.resolve(decide(app)).then(() => order.push("result"));

    expect(order).toEqual(["hook", "result"]);
  });

  it("swallows a throwing onErrorCaught", async () => {
    const credit = makeCredit(() => {
      throw new Error("hook failed");
    });

    const result = await credit.combine(
      [decisionOf("approved"), decisionOf("approved")],
      { resolver: { combine: throwing, isFinal: () => false } },
    )(app);

    expect(result).toStrictEqual({ outcome: "review" });
  });
});

describe("toolkit.combineAll (parallel)", () => {
  const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  it("starts every child before any fold and never calls isFinal", async () => {
    const credit = makeCredit();
    const held = deferred<{ outcome: CreditOutcome }>();
    const first = vi.fn(() => held.promise);
    const second = vi.fn(decisionOf("approved"));
    const third = vi.fn(decisionOf("review"));
    const combine = vi.fn(strongest);
    const isFinal = vi.fn(() => true);
    const resolver: Resolver<CreditOutcome> = { combine, isFinal };

    const pending = credit.combineAll([first, second, third], { resolver })(
      app,
    );
    await settle();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(third).toHaveBeenCalledOnce();
    expect(combine).not.toHaveBeenCalled();

    held.resolve({ outcome: "approved" });

    expect(await pending).toStrictEqual({ outcome: "review" });
    expect(combine).toHaveBeenCalledTimes(2);
    expect(isFinal).not.toHaveBeenCalled();
  });

  it("runs every child even when the first returns the top outcome", async () => {
    const credit = makeCredit();
    const second = vi.fn(decisionOf("approved"));

    const result = await credit.combineAll([decisionOf("declined"), second])(
      app,
    );

    expect(result).toStrictEqual({ outcome: "declined" });
    expect(second).toHaveBeenCalledOnce();
  });

  it("folds in declaration order when completion order is reversed", async () => {
    const credit = makeCredit();
    const completed: string[] = [];
    const later = deferred<void>();
    const child =
      (
        name: string,
        outcome: CreditOutcome,
        wait: Promise<void>,
      ): Decision<App, CreditOutcome> =>
      async () => {
        await wait;
        completed.push(name);
        return { outcome };
      };
    const combine = vi.fn((_: CreditOutcome, next: CreditOutcome) => next);

    const pending = credit.combineAll(
      [
        child("a", "approved", later.promise),
        child("b", "review", later.promise.then(settle)),
        child("c", "declined", Promise.resolve()),
      ],
      { resolver: { combine } },
    )(app);
    await settle();
    later.resolve();

    // "last one wins" is not commutative: declaration order decides.
    expect(await pending).toStrictEqual({ outcome: "declined" });
    expect(completed).toEqual(["c", "a", "b"]);
    expect(combine.mock.calls).toEqual([
      ["approved", "review"],
      ["review", "declined"],
    ]);
  });

  it("turns two rejecting children into onError without rejecting", async () => {
    const hook = vi.fn();
    const credit = makeCredit(hook);
    const first = new Error("first");
    const second = new Error("second");

    const result = await credit.combineAll([
      () => Promise.reject(first),
      decisionOf("approved"),
      () => Promise.reject(second),
    ])(app);

    expect(result).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledTimes(2);
    expect(hook.mock.calls.map(([error]) => error)).toEqual([first, second]);
  });

  it("ends the whole combine with onError when the resolver fails", async () => {
    const hook = vi.fn();
    const credit = makeCredit(hook);
    const boom = new Error("boom");

    const result = await credit.combineAll(
      [decisionOf("approved"), decisionOf("declined")],
      {
        resolver: {
          combine: () => {
            throw boom;
          },
        },
      },
    )(app);

    expect(result).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledExactlyOnceWith(boom);
  });

  it("uses the onError override for a failing child", async () => {
    const credit = makeCredit();

    const result = await credit.combineAll(
      [() => Promise.reject(new Error("down")), decisionOf("approved")],
      { onError: "declined" },
    )(app);

    expect(result).toStrictEqual({ outcome: "declined" });
  });

  it("reads each option and resolver.combine once, and never reads isFinal", async () => {
    const credit = makeCredit();
    const reads: string[] = [];
    const resolver = {
      get combine() {
        reads.push("resolver.combine");
        return strongest;
      },
      get isFinal() {
        reads.push("resolver.isFinal");
        return () => false;
      },
    };
    const options = {
      get resolver() {
        reads.push("resolver");
        return resolver;
      },
      get onError() {
        reads.push("onError");
        return "declined" as const;
      },
    };

    const decide = credit.combineAll(
      [decisionOf("approved"), decisionOf("review")],
      options,
    );
    await decide(app);
    await decide(app);

    expect([...reads].sort()).toEqual([
      "onError",
      "resolver",
      "resolver.combine",
    ]);
  });

  it("returns a single child's outcome without calling the resolver", async () => {
    const credit = makeCredit();
    const combine = vi.fn(strongest);

    const result = await credit.combineAll([decisionOf("approved")], {
      resolver: { combine },
    })(app);

    expect(result).toStrictEqual({ outcome: "approved" });
    expect(combine).not.toHaveBeenCalled();
  });
});

describe("toolkit.combine construction", () => {
  const credit = makeCredit();
  const approved = decisionOf("approved");
  const resolver = { combine: strongest, isFinal: () => false };

  it.each<[string, () => unknown, string]>([
    [
      "decisions is not an array",
      () => credit.combine(approved as never),
      "combine: decisions must be an array",
    ],
    [
      "decisions is empty",
      () => credit.combine([] as never),
      "combine: decisions must not be empty",
    ],
    [
      "a decision is not a function",
      () => credit.combine([approved, "approved"] as never),
      "combine: decisions[1] must be a decision function",
    ],
    [
      "a decision is a hole in a sparse array",
      () =>
        credit.combine(Object.assign(new Array(2), { 0: approved }) as never),
      "combine: decisions[1] must be a decision function",
    ],
    [
      "a hole is backed by a function on the array's prototype",
      () => {
        const decisions = Object.assign(new Array(2), { 0: approved });
        Object.setPrototypeOf(
          decisions,
          Object.assign(Object.create(Array.prototype), { 1: approved }),
        );
        return credit.combine(decisions as never);
      },
      "combine: decisions[1] must be a decision function",
    ],
    [
      "reading an entry shrinks the array",
      () => {
        const decisions = [approved, decisionOf("declined")];
        Object.defineProperty(decisions, 0, {
          get: () => {
            decisions.length = 1;
            return approved;
          },
        });
        return credit.combine(decisions as never);
      },
      "combine: decisions[1] must be a decision function",
    ],
    [
      "the resolver is not an object",
      () => credit.combine([approved], { resolver: null as never }),
      "combine: resolver must be an object with combine and isFinal functions",
    ],
    [
      "the resolver has no isFinal function",
      () =>
        credit.combine([approved], {
          resolver: { combine: strongest } as never,
        }),
      "combine: resolver must be an object with combine and isFinal functions",
    ],
    [
      "the resolver's combine is not a function",
      () =>
        credit.combine([approved], {
          resolver: { ...resolver, combine: "declined" } as never,
        }),
      "combine: resolver must be an object with combine and isFinal functions",
    ],
    [
      "the onError override is not a declared outcome",
      () => credit.combine([approved], { onError: "unknown" as never }),
      'combine: onError "unknown" is not a declared outcome',
    ],
  ])("throws a TypeError when %s", (_, build, message) => {
    const error = thrownBy(build);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe(message);
  });
});

describe("toolkit.combineAll construction", () => {
  const credit = makeCredit();
  const approved = decisionOf("approved");

  it.each<[string, () => unknown, string]>([
    [
      "decisions is not an array",
      () => credit.combineAll(approved as never),
      "combineAll: decisions must be an array",
    ],
    [
      "decisions is empty",
      () => credit.combineAll([] as never),
      "combineAll: decisions must not be empty",
    ],
    [
      "a decision is not a function",
      () => credit.combineAll([approved, "approved"] as never),
      "combineAll: decisions[1] must be a decision function",
    ],
    [
      "the resolver is not an object",
      () => credit.combineAll([approved], { resolver: null as never }),
      "combineAll: resolver must be an object with a combine function",
    ],
    [
      "the resolver's combine is not a function",
      () =>
        credit.combineAll([approved], {
          resolver: { combine: "declined" } as never,
        }),
      "combineAll: resolver must be an object with a combine function",
    ],
    [
      "the onError override is not a declared outcome",
      () => credit.combineAll([approved], { onError: "unknown" as never }),
      'combineAll: onError "unknown" is not a declared outcome',
    ],
  ])("throws a TypeError when %s", (_, build, message) => {
    const error = thrownBy(build);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe(message);
  });

  it("accepts a resolver without isFinal", () => {
    expect(() =>
      credit.combineAll([approved], { resolver: { combine: strongest } }),
    ).not.toThrow();
  });
});

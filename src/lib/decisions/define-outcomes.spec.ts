import { describe, expect, it } from "vitest";
import { defineOutcomes } from "./define-outcomes";

/** Its string conversion throws, so a message must not coerce it. */
const unprintable = {
  toString: () => {
    throw new RangeError("cannot print");
  },
};

/** `["declined", <hole>]`: `forEach` and friends skip index 1. */
const withHole = (): string[] => {
  const outcomes = ["declined"];
  outcomes.length = 2;
  return outcomes;
};

const thrownBy = (build: () => unknown): unknown => {
  try {
    build();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
};

describe("defineOutcomes", () => {
  it.each<[string, () => unknown, string]>([
    [
      "outcomes is not an array",
      () =>
        defineOutcomes("declined" as never, { onError: "declined" as never }),
      "defineOutcomes: outcomes must be an array",
    ],
    [
      "outcomes is empty",
      () => defineOutcomes([] as never, { onError: "declined" as never }),
      "defineOutcomes: outcomes must not be empty",
    ],
    [
      "an outcome is not a string",
      () =>
        defineOutcomes(["declined", 1] as never, {
          onError: "declined" as never,
        }),
      "defineOutcomes: outcomes[1] must be a non-empty string",
    ],
    [
      "an outcome is an empty string",
      () => defineOutcomes(["declined", ""], { onError: "declined" }),
      "defineOutcomes: outcomes[1] must be a non-empty string",
    ],
    [
      "an outcome is a hole in a sparse array",
      () =>
        defineOutcomes(withHole() as never, { onError: "declined" as never }),
      "defineOutcomes: outcomes[1] must be a non-empty string",
    ],
    [
      "a hole is backed by a string on the array's prototype",
      () => {
        const outcomes = withHole();
        Object.setPrototypeOf(
          outcomes,
          Object.assign(Object.create(Array.prototype), { 1: "approved" }),
        );
        return defineOutcomes(outcomes as never, {
          onError: "declined" as never,
        });
      },
      "defineOutcomes: outcomes[1] must be a non-empty string",
    ],
    [
      "reading an outcome shrinks the array",
      () => {
        const outcomes = ["declined", "approved"];
        Object.defineProperty(outcomes, 0, {
          get: () => {
            outcomes.length = 1;
            return "declined";
          },
        });
        return defineOutcomes(outcomes as never, {
          onError: "declined" as never,
        });
      },
      "defineOutcomes: outcomes[1] must be a non-empty string",
    ],
    [
      "an outcome is declared twice",
      () =>
        defineOutcomes(["declined", "review", "declined"], {
          onError: "review",
        }),
      'defineOutcomes: duplicate outcome "declined"',
    ],
    [
      "options are missing",
      () => defineOutcomes(["declined"], undefined as never),
      "defineOutcomes: options.onError is required",
    ],
    [
      "onError is missing",
      () => defineOutcomes(["declined"], {} as never),
      "defineOutcomes: options.onError is required",
    ],
    [
      "onError is not a declared outcome",
      () => defineOutcomes(["declined"], { onError: "review" as never }),
      'defineOutcomes: onError "review" is not a declared outcome',
    ],
    [
      "onError is a non-string whose conversion throws",
      () => defineOutcomes(["declined"], { onError: unprintable as never }),
      "defineOutcomes: onError (object) is not a declared outcome",
    ],
    [
      "onErrorCaught is not a function",
      () =>
        defineOutcomes(["declined"], {
          onError: "declined",
          onErrorCaught: "log" as never,
        }),
      "defineOutcomes: options.onErrorCaught must be a function",
    ],
  ])("throws a TypeError when %s", (_, build, message) => {
    const error = thrownBy(build);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe(message);
  });

  it("returns the declared outcomes and onError", () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });

    expect(credit.outcomes).toEqual(["declined", "review", "approved"]);
    expect(credit.onError).toBe("review");
  });

  it("reads each option once", () => {
    const reads: string[] = [];
    const options = {
      get onError() {
        reads.push("onError");
        return "review" as const;
      },
      get onErrorCaught() {
        reads.push("onErrorCaught");
        return () => {};
      },
    };

    defineOutcomes(["declined", "review", "approved"], options);

    expect(reads).toEqual(["onError", "onErrorCaught"]);
  });

  it("freezes the toolkit and its outcomes", () => {
    const credit = defineOutcomes(["declined", "review", "approved"], {
      onError: "review",
    });

    expect(Object.isFrozen(credit)).toBe(true);
    expect(Object.isFrozen(credit.outcomes)).toBe(true);
  });

  it("copies the input array, so mutating it later changes nothing", () => {
    const input: [string, string] = ["declined", "approved"];
    const credit = defineOutcomes(input, { onError: "declined" });

    input[0] = "changed";
    input.push("added");

    expect(credit.outcomes).toEqual(["declined", "approved"]);
  });

  it('accepts "failed" and "passed" as outcomes (a binary toolkit)', () => {
    const binary = defineOutcomes(["failed", "passed"], { onError: "failed" });

    expect(binary.outcomes).toEqual(["failed", "passed"]);
  });

  it("accepts a function as onErrorCaught", () => {
    expect(() =>
      defineOutcomes(["declined"], {
        onError: "declined",
        onErrorCaught: () => {},
      }),
    ).not.toThrow();
  });
});

describe("toolkit.outcome", () => {
  const credit = defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
  });

  it("returns { outcome } with exactly that key", () => {
    const result = credit.outcome("approved");

    expect(result).toStrictEqual({ outcome: "approved" });
    expect(Reflect.ownKeys(result)).toEqual(["outcome"]);
  });

  it("returns a fresh object on every call", () => {
    expect(credit.outcome("review")).not.toBe(credit.outcome("review"));
  });

  it("throws a TypeError for an outcome outside the set", () => {
    const error = thrownBy(() => credit.outcome("aproved" as never));

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe(
      'outcome: "aproved" is not a declared outcome',
    );
  });

  it("describes a non-string label by its type, without converting it", () => {
    const error = thrownBy(() => credit.outcome(unprintable as never));

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe(
      "outcome: (object) is not a declared outcome",
    );
  });
});

describe("toolkit.resolvers", () => {
  const credit = defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
  });
  type CreditOutcome = (typeof credit.outcomes)[number];

  /** A child that records its call and returns `outcome`. */
  const child = (outcome: CreditOutcome, calls: string[]) => async () => {
    calls.push(outcome);
    return credit.outcome(outcome);
  };

  it("exposes strongestWins with the default precedence merge", () => {
    const { strongestWins } = credit.resolvers;
    expect(strongestWins.combine("approved", "declined")).toBe("declined");
    expect(strongestWins.combine("review", "approved")).toBe("review");
    expect(strongestWins.isFinal("declined")).toBe(true);
    expect(strongestWins.isFinal("review")).toBe(false);
  });

  it("strongestWins gives the same results as no resolver, including the early stop", async () => {
    const withDefault: string[] = [];
    const withBuiltIn: string[] = [];
    const byDefault = credit.combine([
      child("approved", withDefault),
      child("declined", withDefault),
      child("review", withDefault),
    ]);
    const byBuiltIn = credit.combine(
      [
        child("approved", withBuiltIn),
        child("declined", withBuiltIn),
        child("review", withBuiltIn),
      ],
      { resolver: credit.resolvers.strongestWins },
    );
    expect(await byDefault({})).toEqual({ outcome: "declined" });
    expect(await byBuiltIn({})).toEqual({ outcome: "declined" });
    expect(withBuiltIn).toEqual(withDefault);
    expect(withBuiltIn).toEqual(["approved", "declined"]);
  });

  it("runEveryCheck calls every child after a first-outcome result and keeps the strongest", async () => {
    const calls: string[] = [];
    const policy = credit.combine(
      [
        child("declined", calls),
        child("approved", calls),
        child("review", calls),
      ],
      { resolver: credit.resolvers.runEveryCheck },
    );
    expect(await policy({})).toEqual({ outcome: "declined" });
    expect(calls).toEqual(["declined", "approved", "review"]);
    expect(credit.resolvers.runEveryCheck.isFinal("declined")).toBe(false);
  });

  it("both work in combineAll", async () => {
    for (const resolver of [
      credit.resolvers.strongestWins,
      credit.resolvers.runEveryCheck,
    ]) {
      const calls: string[] = [];
      const policy = credit.combineAll(
        [child("approved", calls), child("review", calls)],
        { resolver },
      );
      expect(await policy({})).toEqual({ outcome: "review" });
      expect(calls).toHaveLength(2);
    }
  });

  it("is frozen, with frozen members", () => {
    expect(Object.isFrozen(credit.resolvers)).toBe(true);
    expect(Object.isFrozen(credit.resolvers.strongestWins)).toBe(true);
    expect(Object.isFrozen(credit.resolvers.runEveryCheck)).toBe(true);
  });

  it("is bound to each toolkit's own order", () => {
    const reversed = defineOutcomes(["approved", "review", "declined"], {
      onError: "review",
    });
    expect(reversed.resolvers).not.toBe(credit.resolvers);
    expect(
      reversed.resolvers.strongestWins.combine("declined", "approved"),
    ).toBe("approved");
    expect(reversed.resolvers.strongestWins.isFinal("approved")).toBe(true);
  });
});

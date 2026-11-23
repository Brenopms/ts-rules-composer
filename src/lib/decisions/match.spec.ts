import { describe, expect, it, vi } from "vitest";
import { withSafeError } from "../combinators";
import type { Decision, Rule } from "../types";
import { defineOutcomes } from "./define-outcomes";

interface App {
  employment: string;
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

const makeCredit = (onErrorCaught?: (error: unknown) => void) =>
  defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
    onErrorCaught,
  });

const decisionOf =
  (outcome: CreditOutcome): Decision<App, CreditOutcome> =>
  () => ({ outcome });

const app: App = { employment: "employed" };

describe("toolkit.match routing", () => {
  it("selects the case of a string key and runs no other", async () => {
    const credit = makeCredit();
    const employed = vi.fn(decisionOf("approved"));
    const other = vi.fn(decisionOf("declined"));

    const result = await credit.match(
      (input: App) => input.employment,
      { employed, unemployed: other },
      other,
    )(app);

    expect(result).toStrictEqual({ outcome: "approved" });
    expect(employed).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
  });

  it("selects the case of a number key", async () => {
    const credit = makeCredit();

    const result = await credit.match(
      (): number => 2,
      { 1: "declined", 2: "approved" },
      "review",
    )(app);

    expect(result).toStrictEqual({ outcome: "approved" });
  });

  it("selects the case of a symbol key", async () => {
    const credit = makeCredit();
    const gold = Symbol("gold");
    const silver = Symbol("silver");

    const decide = credit.match(
      (input: App) => (input.employment === "employed" ? gold : silver),
      { [gold]: "approved", [silver]: "declined" },
      "review",
    );

    expect(await decide(app)).toStrictEqual({ outcome: "approved" });
    expect(await decide({ employment: "none" })).toStrictEqual({
      outcome: "declined",
    });
  });

  it("selects an own toString case", async () => {
    const credit = makeCredit();

    const result = await credit.match(
      () => "toString",
      { toString: "approved" },
      "declined",
    )(app);

    expect(result).toStrictEqual({ outcome: "approved" });
  });

  it("uses defaultCase for an inherited toString (not supplied)", async () => {
    const credit = makeCredit();
    const defaultCase = vi.fn(decisionOf("approved"));

    const result = await credit.match(
      (): string => "toString",
      { employed: "declined" },
      defaultCase,
    )(app);

    expect(result).toStrictEqual({ outcome: "approved" });
    expect(defaultCase).toHaveBeenCalledOnce();
  });

  it("uses defaultCase for a missing key", async () => {
    const credit = makeCredit();

    const result = await credit.match(
      (): string => "retired",
      { employed: "declined" },
      "approved",
    )(app);

    expect(result).toStrictEqual({ outcome: "approved" });
  });

  it("awaits an async accessor and an async case", async () => {
    const credit = makeCredit();

    const result = await credit.match(
      async () => "employed",
      { employed: async () => ({ outcome: "approved" as const }) },
      "declined",
    )(app);

    expect(result).toStrictEqual({ outcome: "approved" });
  });

  it("forwards input and context to the accessor and the case", async () => {
    const credit = makeCredit();
    const accessor = vi.fn(() => "employed");
    const employed = vi.fn(decisionOf("approved"));
    const context = { tenant: "eu" };

    await credit.match<App, string, { tenant: string }>(
      accessor,
      { employed },
      "declined",
    )(app, context);

    expect(accessor).toHaveBeenCalledWith(app, context);
    expect(employed).toHaveBeenCalledWith(app, context);
  });

  it("forwards input and context to a decision defaultCase", async () => {
    const credit = makeCredit();
    const defaultCase = vi.fn(decisionOf("approved"));
    const context = { tenant: "eu" };

    await credit.match<App, string, { tenant: string }>(
      () => "retired",
      {},
      defaultCase,
    )(app, context);

    expect(defaultCase).toHaveBeenCalledWith(app, context);
  });

  it("returns a fresh { outcome } without the case's extra fields", async () => {
    const credit = makeCredit();
    const caseResult = { outcome: "approved" as const, score: 720 };

    const result = await credit.match(
      () => "employed",
      { employed: () => caseResult },
      "declined",
    )(app);

    expect(result).toStrictEqual({ outcome: "approved" });
    expect(result).not.toBe(caseResult);
  });

  it("is not affected by changing the cases object after construction", async () => {
    const credit = makeCredit();
    const cases: Record<string, CreditOutcome> = { employed: "approved" };
    const decide = credit.match(() => "employed", cases, "declined");

    cases.employed = "aproved" as never;
    delete cases.employed;

    expect(await decide(app)).toStrictEqual({ outcome: "approved" });
  });
});

describe("toolkit.match failures", () => {
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
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
    [
      "returns an object",
      () => ({ toString: () => "employed" }),
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
    [
      "returns undefined",
      () => undefined,
      (error) => expect(error).toBeInstanceOf(TypeError),
    ],
  ])(
    "gives onError and runs no case or default when the accessor %s",
    async (_, accessor, checkError) => {
      const hook = vi.fn();
      const credit = makeCredit(hook);
      const employed = vi.fn(decisionOf("approved"));
      const defaultCase = vi.fn(decisionOf("approved"));

      const result = await credit.match(
        accessor as never,
        { employed },
        defaultCase,
      )(app);

      expect(result).toStrictEqual({ outcome: "review" });
      expect(employed).not.toHaveBeenCalled();
      expect(defaultCase).not.toHaveBeenCalled();
      expect(hook).toHaveBeenCalledOnce();
      checkError(hook.mock.calls[0]?.[0]);
    },
  );

  it("gives onError when the selected case returns an out-of-set label", async () => {
    const hook = vi.fn();
    const credit = makeCredit(hook);

    const result = await credit.match(
      () => "employed",
      { employed: (() => ({ outcome: "aproved" })) as never },
      "approved",
    )(app);

    expect(result).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
  });

  it("gives onError when a decision defaultCase throws", async () => {
    const hook = vi.fn();
    const credit = makeCredit(hook);

    const result = await credit.match(
      (): string => "retired",
      { employed: "approved" },
      () => {
        throw boom;
      },
    )(app);

    expect(result).toStrictEqual({ outcome: "review" });
    expect(hook).toHaveBeenCalledWith(boom);
  });

  it("calls onErrorCaught before the outcome is returned", async () => {
    const order: string[] = [];
    const credit = makeCredit(() => order.push("hook"));

    const decide = credit.match(
      () => {
        throw boom;
      },
      { employed: "approved" },
      "declined",
    );

    await Promise.resolve(decide(app)).then(() => order.push("result"));

    expect(order).toEqual(["hook", "result"]);
  });

  it("uses the onError override instead of the toolkit onError", async () => {
    const credit = makeCredit();

    const result = await credit.match(
      () => null as never,
      { employed: "approved" },
      "approved",
      { onError: "declined" },
    )(app);

    expect(result).toStrictEqual({ outcome: "declined" });
  });
});

describe("toolkit.match caught branch (caughtCause)", () => {
  const outage = new Error("down");
  const marked: Rule<App> = withSafeError(() => {
    throw outage;
  });
  const makeVerdict = (onErrorCaught?: (error: unknown) => void) =>
    defineOutcomes(["denied", "failed", "passed"], {
      onError: "failed",
      onErrorCaught,
    });

  it("returns the local onError override for a marked raw-Rule branch, hook once", async () => {
    const hook = vi.fn();
    const verdict = makeVerdict(hook);

    const result = await verdict.match(
      (input) => input.employment,
      { employed: marked },
      "passed",
      { onError: "denied" },
    )(app);

    expect(result).toStrictEqual({ outcome: "denied" });
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0]?.[0]).toBe(outage);
  });
});

describe("toolkit.match construction", () => {
  const credit = makeCredit();
  const accessor = () => "employed";
  const gold = Symbol("gold");

  it.each<[string, () => unknown, string]>([
    [
      "accessor is not a function",
      () => credit.match("employment" as never, {}, "review"),
      "match: accessor must be a function",
    ],
    [
      "accessor is missing, before checking the cases",
      () => credit.match(undefined as never, null as never, "review"),
      "match: accessor must be a function",
    ],
    [
      "a case is an unknown outcome",
      () => credit.match(accessor, { employed: "aproved" as never }, "review"),
      'match: cases["employed"] "aproved" is not a declared outcome',
    ],
    [
      "a symbol case is an unknown outcome",
      () => credit.match(() => gold, { [gold]: "aproved" as never }, "review"),
      'match: cases[(symbol)] "aproved" is not a declared outcome',
    ],
    [
      "a case is neither an outcome nor a function",
      () => credit.match(accessor, { employed: 1 as never }, "review"),
      'match: cases["employed"] must be a declared outcome or a decision function',
    ],
    [
      "a never-selected case is explicitly undefined",
      () =>
        credit.match(
          accessor,
          { employed: "approved", retired: undefined },
          "review",
        ),
      'match: cases["retired"] must be a declared outcome or a decision function',
    ],
    [
      "a non-enumerable own case is explicitly undefined",
      () =>
        credit.match(
          accessor,
          Object.defineProperty({ employed: "approved" }, "retired", {
            value: undefined,
          }) as never,
          "review",
        ),
      'match: cases["retired"] must be a declared outcome or a decision function',
    ],
    [
      "cases is null",
      () => credit.match(accessor, null as never, "review"),
      "match: cases must be an object",
    ],
    [
      "cases is a string",
      () => credit.match(accessor, "x" as never, "review"),
      "match: cases must be an object",
    ],
    [
      "cases is a number",
      () => credit.match(accessor, 1 as never, "review"),
      "match: cases must be an object",
    ],
    [
      "cases is a function",
      () => credit.match(accessor, (() => {}) as never, "review"),
      "match: cases must be an object",
    ],
    [
      "defaultCase is missing",
      () =>
        credit.match(accessor, { employed: "approved" }, undefined as never),
      "match: defaultCase must be a declared outcome or a decision function",
    ],
    [
      "defaultCase is an unknown outcome",
      () => credit.match(accessor, { employed: "approved" }, "reveiw" as never),
      'match: defaultCase "reveiw" is not a declared outcome',
    ],
    [
      "the onError override is not a declared outcome",
      () =>
        credit.match(accessor, { employed: "approved" }, "review", {
          onError: "unknown" as never,
        }),
      'match: onError "unknown" is not a declared outcome',
    ],
  ])("throws a TypeError when %s", (_, build, message) => {
    const error = thrownBy(build);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as TypeError).message).toBe(message);
  });
});

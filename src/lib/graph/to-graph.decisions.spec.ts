import { describe, expect, it, vi } from "vitest";
import {
  type Decision,
  defineOutcomes,
  ifElse,
  named,
  pass,
  pipeRules,
} from "../index";
import { attachNode, readNode } from "./node";
import { buildGraph, toGraph } from "./to-graph";

type App = { debtToIncome: number };

const credit = defineOutcomes(["declined", "review", "approved"], {
  onError: "review",
});

const above = (limit: number) =>
  named(
    `debt to income above ${limit}%`,
    (app: App) => app.debtToIncome > limit,
  );

/** An override whose `onError` changes after its first read, counting reads. */
const shiftingOverride = () => {
  const read = vi.fn();
  const override = {
    get onError() {
      read();
      return read.mock.calls.length === 1 ? "declined" : "approved";
    },
  } as { readonly onError: "declined" | "review" | "approved" };
  return { override, read };
};

describe("toGraph on a toolkit ifElse", () => {
  it("describes bare-string sides as outcome leaves under a branch", () => {
    const policy = credit.ifElse(above(50), "declined", "approved");

    expect(toGraph(policy)).toStrictEqual({
      version: 2,
      root: {
        id: "root",
        kind: "branch",
        test: "debt to income above 50%",
        ifTrue: { id: "root.ifTrue", kind: "outcome", outcome: "declined" },
        ifFalse: { id: "root.ifFalse", kind: "outcome", outcome: "approved" },
      },
      outcomes: ["declined", "review", "approved"],
      onError: "review",
    });
  });

  it("nests branches with position-based ids", () => {
    const policy = credit.ifElse(
      above(50),
      "declined",
      credit.ifElse(above(35), "review", "approved"),
    );

    expect(toGraph(policy).root).toStrictEqual({
      id: "root",
      kind: "branch",
      test: "debt to income above 50%",
      ifTrue: { id: "root.ifTrue", kind: "outcome", outcome: "declined" },
      ifFalse: {
        id: "root.ifFalse",
        kind: "branch",
        test: "debt to income above 35%",
        ifTrue: {
          id: "root.ifFalse.ifTrue",
          kind: "outcome",
          outcome: "review",
        },
        ifFalse: {
          id: "root.ifFalse.ifFalse",
          kind: "outcome",
          outcome: "approved",
        },
      },
    });
  });

  it("keeps the toolkit's onError on the graph when the root overrides it", () => {
    const policy = credit.ifElse(above(50), "declined", "approved", {
      onError: "declined",
    });

    expect(toGraph(policy).onError).toBe("review");
  });

  it("records a local onError override on the raw node only", () => {
    const overridden = credit.ifElse(above(50), "declined", "approved", {
      onError: "declined",
    });
    const plain = credit.ifElse(above(50), "declined", "approved");

    expect(readNode(overridden)).toMatchObject({
      decision: { onError: "review", localOnError: "declined" },
    });
    expect(readNode(plain)).not.toHaveProperty("decision.localOnError");
  });

  it("records an explicit override equal to the toolkit default", () => {
    const policy = credit.ifElse(above(50), "declined", "approved", {
      onError: "review",
    });

    expect(readNode(policy)).toMatchObject({
      decision: { onError: "review", localOnError: "review" },
    });
    expect(toGraph(policy).onError).toBe("review");
  });

  it("reads the override once, for both the run and the raw node", async () => {
    const { override, read } = shiftingOverride();
    const policy = credit.ifElse(
      () => {
        throw new Error("predicate down");
      },
      "approved",
      "approved",
      override,
    );

    expect(await policy({ debtToIncome: 0 })).toEqual({ outcome: "declined" });
    expect(readNode(policy)).toMatchObject({
      decision: { localOnError: "declined" },
    });
    expect(toGraph(policy).onError).toBe("review");
    expect(read).toHaveBeenCalledOnce();
  });

  it("gives a rule root neither outcomes nor onError", () => {
    const graph = toGraph(
      ifElse(
        above(50),
        () => pass(),
        () => pass(),
      ),
    );

    expect(graph).not.toHaveProperty("outcomes");
    expect(graph).not.toHaveProperty("onError");
  });

  it("labels an unnamed decision side `decision #n`, sharing the rule counter", () => {
    const policy = credit.ifElse(
      (app: App) => app.debtToIncome > 50,
      () => credit.outcome("declined"),
      "approved",
    );

    expect(toGraph(policy).root).toMatchObject({
      test: "rule #1",
      ifTrue: { kind: "rule", label: "decision #2" },
    });
  });

  it("labels a named decision side by its name", () => {
    const bureauScore: Decision<App, "declined" | "review" | "approved"> = () =>
      credit.outcome("review");

    expect(
      toGraph(credit.ifElse(above(50), "declined", bureauScore)).root,
    ).toMatchObject({ ifFalse: { kind: "rule", label: "bureauScore" } });
  });

  it("keeps `rule #n` for unnamed leaves of a rule ifElse", () => {
    const rule = ifElse(
      (app: App) => app.debtToIncome > 50,
      () => pass(),
      () => pass(),
    );

    expect(toGraph(rule).root).toMatchObject({
      test: "rule #1",
      ifTrue: { label: "rule #2" },
      ifFalse: { label: "rule #3" },
    });
  });

  it("labels an unknown node kind in decision position `decision #n`", () => {
    // Another package version may attach a kind this one does not know.
    const future = attachNode(() => credit.outcome("review"), {
      kind: "mystery",
    } as never);
    const policy = credit.ifElse(
      (app: App) => app.debtToIncome > 50,
      future,
      "approved",
    );

    expect(toGraph(policy).root).toMatchObject({
      test: "rule #1",
      ifTrue: { kind: "rule", label: "decision #2" },
    });
  });

  it("never runs the predicate or the decisions", () => {
    const test = vi.fn((app: App) => app.debtToIncome > 50);
    const decide = vi.fn(() => credit.outcome("review"));
    toGraph(credit.ifElse(test, decide, credit.ifElse(test, "review", decide)));

    expect(test).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
  });
});

describe("toGraph on a toolkit match", () => {
  type Applicant = { employment: string };
  const byEmployment = named("employment", (app: Applicant) => app.employment);
  const bureauScore: Decision<
    Applicant,
    "declined" | "review" | "approved"
  > = () => credit.outcome("review");

  it("describes outcome cases, decision cases and the default under a switch", () => {
    const employment = credit.match(
      byEmployment,
      { employed: "approved", contractor: bureauScore, unemployed: "declined" },
      "review",
    );

    expect(toGraph(employment)).toStrictEqual({
      version: 2,
      root: {
        id: "root",
        kind: "switch",
        selector: "employment",
        cases: [
          {
            key: "employed",
            node: { id: "root.cases.0", kind: "outcome", outcome: "approved" },
          },
          {
            key: "contractor",
            node: { id: "root.cases.1", kind: "rule", label: "bureauScore" },
          },
          {
            key: "unemployed",
            node: { id: "root.cases.2", kind: "outcome", outcome: "declined" },
          },
        ],
        default: { id: "root.default", kind: "outcome", outcome: "review" },
      },
      outcomes: ["declined", "review", "approved"],
      onError: "review",
    });
  });

  it("always records the default, even with no cases", () => {
    const root = toGraph(credit.match(byEmployment, {}, bureauScore)).root;

    expect(root).toStrictEqual({
      id: "root",
      kind: "switch",
      selector: "employment",
      cases: [],
      default: { id: "root.default", kind: "rule", label: "bureauScore" },
    });
  });

  it("labels unnamed cases and the default `decision #n`, the selector `rule #n`", () => {
    const employment = credit.match(
      (app: Applicant) => app.employment,
      // An inline arrow would take its key as its name; an array element has none.
      { employed: [() => credit.outcome("approved")][0] },
      () => credit.outcome("review"),
    );

    expect(toGraph(employment).root).toMatchObject({
      selector: "rule #1",
      cases: [{ node: { kind: "rule", label: "decision #2" } }],
      default: { kind: "rule", label: "decision #3" },
    });
  });

  it("keeps case keys in Reflect.ownKeys order, symbols as Symbol(desc)", () => {
    const vip = Symbol("vip");
    const tiers = credit.match(
      (app: Applicant) => app.employment,
      { b: "review", 2: "declined", [vip]: "approved", a: "approved" },
      "review",
    );
    const root = toGraph(tiers).root as { cases: { key: string }[] };

    expect(root.cases.map((entry) => entry.key)).toEqual([
      "2",
      "b",
      "a",
      "Symbol(vip)",
    ]);
  });

  it("keeps the toolkit's onError on the graph, the override on the raw node", () => {
    const overridden = credit.match(byEmployment, {}, "review", {
      onError: "declined",
    });

    expect(toGraph(overridden).onError).toBe("review");
    expect(readNode(overridden)).toMatchObject({
      decision: { onError: "review", localOnError: "declined" },
    });
    expect(
      readNode(credit.match(byEmployment, {}, "review")),
    ).not.toHaveProperty("decision.localOnError");
  });

  it("reads the override once, for both the run and the raw node", async () => {
    const { override, read } = shiftingOverride();
    const employment = credit.match(
      () => {
        throw new Error("accessor down");
      },
      {},
      "approved",
      override,
    );

    expect(await employment({})).toEqual({ outcome: "declined" });
    expect(readNode(employment)).toMatchObject({
      decision: { localOnError: "declined" },
    });
    expect(toGraph(employment).onError).toBe("review");
    expect(read).toHaveBeenCalledOnce();
  });

  it("lists a match and a nested toolkit node in decisionIds", () => {
    const employment = credit.match(
      byEmployment,
      {
        employed: credit.ifElse(
          (app: Applicant) => app.employment === "probation",
          "review",
          "approved",
        ),
      },
      "review",
    );

    expect([...buildGraph(employment).decisionIds]).toEqual([
      "root",
      "root.cases.0",
    ]);
  });

  it("keeps a toolkit match inside a rule pipeline a leaf", () => {
    const passing = defineOutcomes(["passed"], { onError: "passed" });
    const pipeline = pipeRules([passing.match(() => "a", {}, "passed")]);

    expect(toGraph(pipeline).root).toMatchObject({
      steps: [{ kind: "rule", label: "rule #1" }],
    });
  });

  it("never runs the accessor or the cases", () => {
    const accessor = vi.fn((app: Applicant) => app.employment);
    const decide = vi.fn(() => credit.outcome("review"));
    toGraph(credit.match(accessor, { employed: decide }, decide));

    expect(accessor).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
  });

  describe("read-once capture", () => {
    it("reads a getter-backed case once, across construction, graph and run", async () => {
      const read = vi.fn(() => "approved" as const);
      const cases = {
        get employed() {
          return read();
        },
      };
      const employment = credit.match(byEmployment, cases, "review");
      const graph = toGraph(employment);

      expect(await employment({ employment: "employed" })).toEqual({
        outcome: "approved",
      });
      expect(graph.root).toMatchObject({
        cases: [{ key: "employed", node: { outcome: "approved" } }],
      });
      expect(read).toHaveBeenCalledOnce();
    });

    it("ignores a case replaced after construction, in the graph and a run", async () => {
      const cases: Record<string, "declined" | "review" | "approved"> = {
        employed: "approved",
      };
      const employment = credit.match(byEmployment, cases, "review");
      cases.employed = "declined";
      cases.unemployed = "declined";

      expect(toGraph(employment).root).toMatchObject({
        cases: [{ key: "employed", node: { outcome: "approved" } }],
      });
      expect(
        (toGraph(employment).root as { cases: unknown[] }).cases,
      ).toHaveLength(1);
      expect(await employment({ employment: "employed" })).toEqual({
        outcome: "approved",
      });
    });
  });
});

describe("toGraph on a named toolkit decision", () => {
  const policy = credit.ifElse(
    above(50),
    "declined",
    credit.ifElse(above(35), "review", "approved"),
  );

  it("describes a named toolkit root as a leaf with the toolkit's outcomes", () => {
    expect(toGraph(named("Credit policy", policy))).toStrictEqual({
      version: 2,
      root: { id: "root", kind: "rule", label: "Credit policy" },
      outcomes: ["declined", "review", "approved"],
      onError: "review",
    });
  });

  it("keeps the toolkit's onError when the named root overrides it", () => {
    const overridden = credit.ifElse(above(50), "declined", "approved", {
      onError: "declined",
    });

    expect(toGraph(named("Credit policy", overridden)).onError).toBe("review");
  });

  it("keeps the marker through nested named calls", () => {
    expect(toGraph(named("Outer", named("Inner", policy)))).toStrictEqual({
      version: 2,
      root: { id: "root", kind: "rule", label: "Outer" },
      outcomes: ["declined", "review", "approved"],
      onError: "review",
    });
  });

  it("still carries named params", () => {
    expect(
      toGraph(named("Credit policy", policy, { params: { limit: 50 } })).root,
    ).toStrictEqual({
      id: "root",
      kind: "rule",
      label: "Credit policy",
      params: { limit: 50 },
    });
  });

  it("gives a named rule or hand-written decision no outcomes", () => {
    const bureauScore: Decision<App, "declined" | "review" | "approved"> = () =>
      credit.outcome("review");
    const rule = ifElse(
      above(50),
      () => pass(),
      () => pass(),
    );

    expect(toGraph(named("Bureau", bureauScore))).not.toHaveProperty(
      "outcomes",
    );
    expect(toGraph(named("Rule", rule))).not.toHaveProperty("outcomes");
  });

  it("leaves a named toolkit child a leaf, outside decisionIds", () => {
    const outer = credit.ifElse(
      above(70),
      "declined",
      named("Affordability", policy),
    );
    const { graph, decisionIds } = buildGraph(outer);

    expect(graph.root).toMatchObject({
      ifFalse: { id: "root.ifFalse", kind: "rule", label: "Affordability" },
    });
    expect([...decisionIds]).toEqual(["root"]);
  });

  it("keeps a named root out of decisionIds", () => {
    // Only structured toolkit nodes are listed; a named leaf draws as a box.
    expect(buildGraph(named("Credit policy", policy)).decisionIds.size).toBe(0);
  });

  it("never runs the decision", () => {
    const test = vi.fn((app: App) => app.debtToIncome > 50);
    toGraph(
      named("Credit policy", credit.ifElse(test, "declined", "approved")),
    );

    expect(test).not.toHaveBeenCalled();
  });
});

describe("buildGraph (internal)", () => {
  it("returns the same graph as toGraph", () => {
    const policy = credit.ifElse(above(50), "declined", "approved");

    expect(buildGraph(policy).graph).toStrictEqual(toGraph(policy));
  });

  it("lists the ids of toolkit-built nodes in decisionIds", () => {
    const policy = credit.ifElse(
      above(50),
      "declined",
      credit.ifElse(above(35), "review", "approved"),
    );

    expect([...buildGraph(policy).decisionIds]).toEqual([
      "root",
      "root.ifFalse",
    ]);
  });

  it("keeps a toolkit decision inside a rule pipeline a leaf", () => {
    // A toolkit whose outcomes are all rule outcomes type-checks as a Rule.
    const passing = defineOutcomes(["passed"], { onError: "passed" });
    const pipeline = pipeRules([
      passing.ifElse(() => true, "passed", "passed"),
    ]);
    const { graph, decisionIds } = buildGraph(pipeline);

    expect(graph).toStrictEqual({
      version: 2,
      root: {
        id: "root",
        kind: "sequence",
        via: "pipeRules",
        steps: [{ id: "root.steps.0", kind: "rule", label: "rule #1" }],
      },
    });
    expect(decisionIds.size).toBe(0);
  });

  it("lists no ids for a rule ifElse with the same shape", () => {
    const rule = ifElse(
      above(50),
      () => pass(),
      () => pass(),
    );

    expect(buildGraph(rule).decisionIds.size).toBe(0);
  });
});

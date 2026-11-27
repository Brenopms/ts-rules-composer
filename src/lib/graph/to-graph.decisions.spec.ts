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

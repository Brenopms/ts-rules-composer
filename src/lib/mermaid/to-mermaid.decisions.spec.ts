import { describe, expect, it } from "vitest";
import {
  type Decision,
  defineOutcomes,
  ifElse,
  named,
  pass,
  pipeRules,
} from "../index";
import { toMermaid } from "./to-mermaid";

type App = { debtToIncome: number };
type CreditOutcome = "declined" | "review" | "approved";

const credit = defineOutcomes(["declined", "review", "approved"], {
  onError: "review",
});

const above = (limit: number) =>
  named(
    `debt to income above ${limit}%`,
    (app: App) => app.debtToIncome > limit,
  );

const affordability = credit.ifElse(
  above(50),
  "declined",
  credit.ifElse(above(35), "review", "approved"),
);

const bureauScore: Decision<App, CreditOutcome> = () =>
  credit.outcome("review");

describe("toMermaid on a decision", () => {
  it("draws outcome leaves as stadiums that end their path", () => {
    expect(toMermaid(affordability)).toBe(
      [
        "flowchart TD",
        "  input([input])",
        '  root{"debt to income above 50#37;"}',
        '  root_ifTrue(["declined"])',
        '  root_ifFalse{"debt to income above 35#37;"}',
        '  root_ifFalse_ifTrue(["review"])',
        '  root_ifFalse_ifFalse(["approved"])',
        "  input --> root",
        '  root -->|"yes"| root_ifTrue',
        '  root -->|"no"| root_ifFalse',
        '  root_ifFalse -->|"yes"| root_ifFalse_ifTrue',
        '  root_ifFalse -->|"no"| root_ifFalse_ifFalse',
      ].join("\n"),
    );
  });

  it("ignores failEdges", () => {
    const withDecision = credit.ifElse(above(50), "declined", bureauScore);

    expect(toMermaid(withDecision, { failEdges: true })).toBe(
      toMermaid(withDecision),
    );
  });

  it("draws a hand-written decision alone as a rule diagram", () => {
    expect(toMermaid(bureauScore)).toBe(
      [
        "flowchart TD",
        "  input([input])",
        '  root["bureauScore"]',
        "  passed([passed])",
        "  input --> root",
        "  root --> passed",
      ].join("\n"),
    );
  });

  it("connects a hand-written decision under a toolkit branch to the outcome-set terminal", () => {
    expect(toMermaid(credit.ifElse(above(50), "declined", bureauScore))).toBe(
      [
        "flowchart TD",
        "  input([input])",
        '  root{"debt to income above 50#37;"}',
        '  root_ifTrue(["declined"])',
        '  root_ifFalse["bureauScore"]',
        '  outcome(["declined / review / approved"])',
        "  input --> root",
        '  root -->|"yes"| root_ifTrue',
        '  root -->|"no"| root_ifFalse',
        "  root_ifFalse --> outcome",
      ].join("\n"),
    );
  });

  it("cuts the outcome-set terminal at maxLabelLength", () => {
    const text = toMermaid(credit.ifElse(above(50), "declined", bureauScore), {
      maxLabelLength: 12,
    });

    expect(text).toContain('  outcome(["declined / #8230;"])');
  });

  it("labels an unnamed decision side `decision #n`", () => {
    const text = toMermaid(
      credit.ifElse(above(50), "declined", () => credit.outcome("review")),
    );

    // `#` is escaped like every label character outside the plain set.
    expect(text).toContain('  root_ifFalse["decision #35;1"]');
  });

  it("escapes hostile outcome strings in stadiums and the terminal", () => {
    const hostile = defineOutcomes(['x"]) --> evil', "ok"], { onError: "ok" });
    const decide: Decision<App, 'x"]) --> evil' | "ok"> = () =>
      hostile.outcome("ok");
    const text = toMermaid(hostile.ifElse(above(50), 'x"]) --> evil', decide));

    expect(text).toContain('  root_ifTrue(["x#34;#93;#41; --#62; evil"])');
    expect(text).toContain('  outcome(["x#34;#93;#41; --#62; evil / ok"])');
  });

  it("draws a toolkit decision inside a rule pipeline as one box", () => {
    const passing = defineOutcomes(["passed"], { onError: "passed" });
    const pipeline = pipeRules([
      passing.ifElse(() => true, "passed", "passed"),
    ]);

    expect(toMermaid(pipeline)).toBe(
      [
        "flowchart TD",
        "  input([input])",
        '  root_steps_0["rule #35;1"]',
        "  passed([passed])",
        "  input --> root_steps_0",
        "  root_steps_0 --> passed",
      ].join("\n"),
    );
  });

  it("draws a named toolkit root as a box ending at the outcome-set terminal", () => {
    expect(toMermaid(named("Credit policy", affordability))).toBe(
      [
        "flowchart TD",
        "  input([input])",
        '  root["Credit policy"]',
        '  outcome(["declined / review / approved"])',
        "  input --> root",
        "  root --> outcome",
      ].join("\n"),
    );
  });

  it("draws a named hand-written decision as a rule diagram", () => {
    expect(toMermaid(named("Bureau", bureauScore))).toBe(
      [
        "flowchart TD",
        "  input([input])",
        '  root["Bureau"]',
        "  passed([passed])",
        "  input --> root",
        "  root --> passed",
      ].join("\n"),
    );
  });

  it("leaves rule ifElse diagrams as they were", () => {
    const rule = ifElse(
      above(50),
      named("decline", () => pass()),
      named("approve", () => pass()),
    );

    expect(toMermaid(rule)).toBe(
      [
        "flowchart TD",
        "  input([input])",
        '  root{"debt to income above 50#37;"}',
        '  root_ifTrue["decline"]',
        '  root_ifFalse["approve"]',
        "  passed([passed])",
        "  input --> root",
        '  root -->|"yes"| root_ifTrue',
        '  root -->|"no"| root_ifFalse',
        "  root_ifTrue --> passed",
        "  root_ifFalse --> passed",
      ].join("\n"),
    );
  });
});

import { describe, expect, it } from "vitest";
import { defineOutcomes } from "../decisions";
import { readNode } from "./node";

/**
 * Decision combinators not yet recorded attach no graph metadata
 * (SPEC-decisions, assumption 8); `decision-graph` adds the nodes one kind at
 * a time (`ifElse` and `match` are in `to-graph.decisions.spec.ts`). Lives outside
 * `decisions/` so that module never imports `graph/`.
 */
describe("decision combinators attach no graph node", () => {
  const credit = defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
  });

  it("combine", () => {
    expect(readNode(credit.combine([() => ({ outcome: "review" })]))).toBe(
      undefined,
    );
  });

  it("combineAll", () => {
    expect(readNode(credit.combineAll([() => ({ outcome: "review" })]))).toBe(
      undefined,
    );
  });

  it("mapOutcome", () => {
    expect(
      readNode(
        credit.mapOutcome(() => ({ outcome: "passed" }), {
          failed: "declined",
        }),
      ),
    ).toBe(undefined);
  });
});

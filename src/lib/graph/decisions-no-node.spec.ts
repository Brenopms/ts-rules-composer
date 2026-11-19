import { describe, expect, it } from "vitest";
import { defineOutcomes } from "../decisions";
import { readNode } from "./node";

/**
 * Decision combinators attach no graph metadata yet (SPEC-decisions,
 * assumption 8); `decision-graph` adds the nodes. Lives outside
 * `decisions/` so that module never imports `graph/`.
 */
describe("decision combinators attach no graph node", () => {
  const credit = defineOutcomes(["declined", "review", "approved"], {
    onError: "review",
  });

  it("ifElse", () => {
    expect(readNode(credit.ifElse(() => true, "review", "approved"))).toBe(
      undefined,
    );
  });
});

/**
 * Test fixtures for the three-valued tables of `every` and `oneOf`
 * (SPEC-rule-error-provenance): a child is T (passed), F (unmarked failure)
 * or U (caught failure). Payloads and causes depend on the position, so the
 * expected result shows which child each came from.
 */
import { expect } from "vitest";
import { fail, pass } from "../../helpers";
import type { Rule, RuleResult } from "../../types";

export type Cell = "T" | "F" | "U";

/** One cause per position, so the chosen cause is checked by identity. */
export const causes = [new Error("cause 0"), new Error("cause 1")] as const;

/** A caught failure with the payload `u<index>` and `causes[index]`. */
export const caughtAt = (index: number): RuleResult => ({
  outcome: "failed",
  error: `u${index}`,
  caughtCause: causes[index],
});

const resultOf = (cell: Cell, index: number): RuleResult => {
  if (cell === "T") {
    return pass();
  }
  if (cell === "F") {
    return fail(`f${index}`);
  }
  return caughtAt(index);
};

/** Children from a row such as `"FU"`: one per letter, in order. */
export const children = (cells: string): Rule<unknown>[] =>
  [...cells].map((cell, index) => () => resultOf(cell as Cell, index));

/** The aggregate's U: the collected payloads and the cause at `index`. */
export const caught = (error: string[], index: number) => ({
  outcome: "failed" as const,
  error,
  caughtCause: causes[index],
});

/** Exact result, plus the cause by identity when one is expected. */
export const expectResult = (
  result: RuleResult<unknown>,
  expected: RuleResult<unknown>,
): void => {
  expect(result).toStrictEqual(expected);
  if ("caughtCause" in expected) {
    expect((result as { caughtCause?: unknown }).caughtCause).toBe(
      expected.caughtCause,
    );
  }
};

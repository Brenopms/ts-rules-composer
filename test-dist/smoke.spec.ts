import { describe, expect, inject, it } from "vitest";
import { type Entry, runInConsumer } from "./helpers";

describe.each<Entry>(["esm", "cjs"])(
  "installed package behavior (%s)",
  (entry) => {
    const run = <T>(body: string) =>
      runInConsumer<T>(inject("projectDir"), entry, body);

    it("pass() returns a passed result", () => {
      expect(run(`return m.pass();`)).toEqual({ status: "passed" });
    });

    it("fail() returns a failed result carrying the error", () => {
      expect(run(`return m.fail("x");`)).toEqual({
        status: "failed",
        error: "x",
      });
    });

    it("pipe() composes functions left to right", () => {
      expect(run(`return m.pipe(2, (x) => x + 1, (x) => x * 2);`)).toBe(6);
    });

    it("every() resolves async rules and collects errors", async () => {
      const result = run(
        `return await m.every([async () => m.pass(), () => m.fail("e")])(1);`,
      );
      expect(result).toEqual({ status: "failed", error: ["e"] });
    });
  },
);

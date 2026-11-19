import { describe, expect, it, vi } from "vitest";
import type { Rule } from "../../types";
import { match } from "./match";

/**
 * Pins behavior of rule `match` that differs from `toolkit.match` and must
 * survive its move onto the shared switch engine (decisions plan, D5).
 */
describe("rule match characterization", () => {
  it("runs a case inherited through the prototype, not the default", async () => {
    const inherited = vi
      .fn<Rule<{ role: string }, string>>()
      .mockResolvedValue({ outcome: "passed" });
    const defaultCase = vi
      .fn<Rule<{ role: string }, string>>()
      .mockResolvedValue({ outcome: "failed", error: "default ran" });
    const cases = Object.create({ admin: inherited }) as Record<
      string,
      Rule<{ role: string }, string>
    >;

    const result = await match(
      (user: { role: string }) => user.role,
      cases,
      defaultCase,
    )({ role: "admin" });

    expect(result).toEqual({ outcome: "passed" });
    expect(inherited).toHaveBeenCalledWith({ role: "admin" }, undefined);
    expect(defaultCase).not.toHaveBeenCalled();
  });

  it("propagates a synchronous accessor throw", async () => {
    const boom = new Error("boom");
    const matcher = match(
      (): string => {
        throw boom;
      },
      {},
      "default",
    );

    await expect(matcher({})).rejects.toBe(boom);
  });

  it("propagates an async accessor rejection", async () => {
    const boom = new Error("boom");
    const matcher = match(
      (): Promise<string> => Promise.reject(boom),
      {},
      "default",
    );

    await expect(matcher({})).rejects.toBe(boom);
  });
});

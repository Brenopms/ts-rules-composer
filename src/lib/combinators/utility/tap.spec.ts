import { describe, vi, beforeEach, it, expect } from "vitest";
import { composeRules } from "../../composition/compose-rules";
import { fail, pass } from "../../helpers";
import { Rule } from "../../types";
import { tap } from "./tap";

describe("tap (standalone)", () => {
  const mockEffect = vi.fn();
  const mockRule = vi.fn(() => pass());
  const mockContext = { logger: console };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Basic functionality
  it("should call effect without modifying rule result", async () => {
    const tappedRule = tap(mockEffect)(mockRule);
    const input = { test: "value" };
    const result = await tappedRule(input);

    expect(result).toEqual(pass());
    expect(mockEffect).toHaveBeenCalledWith(input, pass(), undefined);
    expect(mockRule).toHaveBeenCalledWith(input, undefined);
  });

  // Error handling
  it("should not propagate effect errors", async () => {
    const errorEffect = vi.fn(() => {
      throw new Error("Effect failed");
    });
    const tappedRule = tap(errorEffect)(mockRule);

    await expect(tappedRule({})).resolves.toEqual(pass());
    expect(errorEffect).toHaveBeenCalled();
  });

  // Context handling
  it("should pass context to both rule and effect", async () => {
    const tappedRule = tap(mockEffect)(mockRule);
    await tappedRule({}, mockContext);

    expect(mockRule).toHaveBeenCalledWith({}, mockContext);
    expect(mockEffect).toHaveBeenCalledWith({}, pass(), mockContext);
  });

  // Async effects
  it("should handle async effects", async () => {
    const asyncEffect = vi.fn(async () => {
      await Promise.resolve();
    });
    const tappedRule = tap(asyncEffect)(mockRule);
    await tappedRule({});

    expect(asyncEffect).toHaveBeenCalled();
  });

  // Composition
  it("should work with manual composition", async () => {
    const rule1 = vi.fn(() => pass());
    const rule2 = vi.fn(() => fail("Error"));
    const effect1 = vi.fn();
    const effect2 = vi.fn();

    const pipeline = tap(effect2)(composeRules([tap(effect1)(rule1), rule2]));

    await pipeline({});
    expect(effect1).toHaveBeenCalledWith({}, pass(), undefined);
    expect(effect2).toHaveBeenCalledWith({}, fail("Error"), undefined);
  });

  // Type safety tests
  it("should enforce input type matching", () => {
    type StrictInput = { id: string };
    const typedRule: Rule<StrictInput> = () => pass();

    // Valid usage
    tap((input: StrictInput) => console.log(input.id))(typedRule);

    // @ts-expect-error - Should fail if effect expects wrong input type
    tap((input: { other: number }) => {})(typedRule);
  });

  // Edge cases
  it("should handle null/undefined inputs", async () => {
    const effect = vi.fn();
    const rule = () => pass();
    const tappedRule = tap(effect)(rule);

    await tappedRule(null as any);
    expect(effect).toHaveBeenCalledWith(null, pass(), undefined);
  });

  it("should handle effect returning Promise<void>", async () => {
    const asyncEffect = async () => {
      await Promise.resolve();
    };
    const tappedRule = tap(asyncEffect)(mockRule);

    await expect(tappedRule({})).resolves.toEqual(pass());
  });
});

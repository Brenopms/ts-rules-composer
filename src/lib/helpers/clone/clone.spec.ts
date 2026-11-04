import { afterEach, describe, expect, it, vi } from "vitest";
import { clone } from "./clone";

describe("clone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deep copies a plain object without sharing references", () => {
    const original = { a: { b: 1 } };
    const copy = clone(original);

    expect(copy).toEqual(original);
    expect(copy.a).not.toBe(original.a);
  });

  // Pins current behavior: any falsy input (including 0 and "") yields {}.
  // Documents the contract as it is today, not necessarily as it should be.
  it.each([null, undefined, 0, ""])(
    "returns {} for falsy input %p",
    (value) => {
      expect(clone(value)).toEqual({});
    },
  );

  it("returns {} and warns when the value cannot be serialized", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(clone(circular)).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

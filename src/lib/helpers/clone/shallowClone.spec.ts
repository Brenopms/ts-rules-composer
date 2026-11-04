import { afterEach, describe, expect, it, vi } from "vitest";
import { shallowClone } from "./shallowClone";

describe("shallowClone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies top-level properties but shares nested references", () => {
    const original = { a: { b: 1 }, c: 2 };
    const copy = shallowClone(original);

    expect(copy).not.toBe(original);
    expect(copy).toEqual(original);
    expect(copy.a).toBe(original.a);
  });

  // Pins current behavior: any falsy input (including 0 and "") yields {}.
  // Documents the contract as it is today, not necessarily as it should be.
  it.each([null, undefined, 0, ""])(
    "returns {} for falsy input %p",
    (value) => {
      expect(shallowClone(value)).toEqual({});
    },
  );

  it("returns {} and warns when spreading the value throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("no keys");
        },
      },
    );

    expect(shallowClone(hostile)).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { clone } from "./clone";
import { getCloneFn } from "./getCloneFn";
import { shallowClone } from "./shallowClone";

describe("getCloneFn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects shallowClone for the shallow strategy", () => {
    expect(getCloneFn({ cloneStrategy: "shallow" })).toBe(shallowClone);
  });

  it("selects structuredClone for the structured strategy when available", () => {
    expect(getCloneFn({ cloneStrategy: "structured" })).toBe(structuredClone);
  });

  it("falls back to clone when structuredClone is unavailable", () => {
    vi.stubGlobal("structuredClone", undefined);

    expect(getCloneFn({ cloneStrategy: "structured" })).toBe(clone);
  });

  it.each([{ cloneStrategy: "json" as const }, {}])(
    "selects clone for %o",
    (options) => {
      expect(getCloneFn(options)).toBe(clone);
    },
  );
});

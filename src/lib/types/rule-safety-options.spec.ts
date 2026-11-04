import { describe, expect, it } from "vitest";
import { every, withFallback, withMemoize } from "../combinators";
import { pass } from "../helpers";
import type { CompositionOptions } from "./composition-options";
import type { RuleSafetyOptions } from "./rule-safety-options";

const transform = () => "transformed";

describe("RuleSafetyOptions", () => {
  it("accepts every valid combination", () => {
    const valid: RuleSafetyOptions<string>[] = [
      {},
      { errorHandlingMode: "safe" },
      { errorTransform: transform },
      { errorHandlingMode: "safe", errorTransform: transform },
      { errorHandlingMode: "unsafe" },
    ];

    expect(valid).toHaveLength(5);
  });

  it("rejects errorTransform in unsafe mode", () => {
    // @ts-expect-error errorTransform has no effect when errorHandlingMode is "unsafe"
    const opts: RuleSafetyOptions<string> = {
      errorHandlingMode: "unsafe",
      errorTransform: transform,
    };

    expect(opts.errorHandlingMode).toBe("unsafe");
  });

  it("rejects unknown modes", () => {
    // @ts-expect-error "loud" is not a valid errorHandlingMode
    const opts: RuleSafetyOptions<string> = { errorHandlingMode: "loud" };

    expect(opts.errorHandlingMode).toBe("loud");
  });
});

describe("combinators consuming RuleSafetyOptions", () => {
  it("CompositionOptions keeps accepting valid shapes and rejects the invalid one", () => {
    const ok: CompositionOptions<string> = {
      cloneContext: true,
      errorHandlingMode: "safe",
      errorTransform: transform,
    };
    // @ts-expect-error errorTransform has no effect when errorHandlingMode is "unsafe"
    const bad: CompositionOptions<string> = {
      errorHandlingMode: "unsafe",
      errorTransform: transform,
    };

    expect([ok, bad]).toHaveLength(2);
  });

  it("every, withFallback and withMemoize accept the documented shapes", () => {
    const rule = () => pass();

    expect(every([rule], { errorHandlingMode: "unsafe" })).toBeTypeOf(
      "function",
    );
    expect(
      withFallback(rule, rule, {
        errorHandlingMode: "safe",
        errorTransform: transform,
      }),
    ).toBeTypeOf("function");
    expect(
      withMemoize(rule, () => "key", { errorHandlingMode: "unsafe" }),
    ).toBeTypeOf("function");
  });
});

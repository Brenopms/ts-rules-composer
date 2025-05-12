import { describe, vi, beforeEach, it, expect } from "vitest";
import { pass, fail } from "../../helpers";
import { inject } from "./inject";

describe("inject (basic)", () => {
  const mockRule = vi.fn((input: string) =>
    input === "valid" ? pass() : fail("Invalid input"),
  );

  const mockFactory = (dep: { prefix: string }) => {
    return (input: string) =>
      input.startsWith(dep.prefix) ? pass() : fail("Missing prefix");
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("injects dependencies into rule factory", async () => {
    const rule = inject({ prefix: "test_" }, mockFactory);
    const result = await rule("test_valid");
    expect(result.status).toBe("passed");
  });

  it("passes through failures", async () => {
    const rule = inject({ prefix: "test_" }, mockFactory);
    const result = await rule("invalid");
    expect(result.status).toBe("failed");
    expect(result).toEqual(fail("Missing prefix"));
  });

  it("preserves original rule behavior", async () => {
    const rule = inject({}, () => mockRule);
    const validResult = await rule("valid");
    const invalidResult = await rule("invalid");

    expect(validResult.status).toBe("passed");
    expect(invalidResult).toEqual(fail("Invalid input"));
    expect(mockRule).toHaveBeenCalledTimes(2);
  });

  it("works with async dependencies", async () => {
    const asyncFactory = (dep: Promise<{ timeout: number }>) => {
      return async (_: string) => {
        const config = await dep;
        await new Promise((resolve) => setTimeout(resolve, config.timeout));
        return pass();
      };
    };

    const rule = inject(Promise.resolve({ timeout: 10 }), asyncFactory);
    const result = await rule("any");
    expect(result.status).toBe("passed");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pick } from "./pick";
import { pass, fail } from "../../helpers";
import { Rule } from "../../types";

describe("pick", () => {
  interface TestUser {
    name: string;
    age?: number;
    profile?: {
      email: string;
      verified?: boolean;
    };
  }

  const mockUser: TestUser = {
    name: "John Doe",
    age: 30,
    profile: {
      email: "john@example.com",
      verified: true,
    },
  };

  // Mock rule for testing
  const mockRule = vi.fn((value: unknown) =>
    value === true ? pass() : fail("Value must be true"),
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should apply rule to extracted value", async () => {
    const rule = pick((user: TestUser) => user.profile?.verified, mockRule);

    const result = await rule(mockUser);
    expect(mockRule).toHaveBeenCalledWith(true, undefined);
    expect(result).toEqual(pass());
  });

  it("should fail when getter returns undefined with no default", async () => {
    const rule = pick((user: any) => user.profile.missingProp, mockRule);

    const result = await rule(mockUser);
    expect(result).toEqual(fail("Missing required value"));
    expect(mockRule).not.toHaveBeenCalled();
  });

  it("should use default value when getter returns undefined", async () => {
    const rule = pick(
      (user: any) => user.profile?.missingProp,
      mockRule,
      true, // default value
    );

    const result = await rule(mockUser);
    expect(mockRule).toHaveBeenCalledWith(true, undefined);
    expect(result).toEqual(pass());
  });

  it("should pass context to inner rule", async () => {
    const context = { requestId: "123" };
    const rule = pick((user: TestUser) => user.profile?.verified, mockRule);

    await rule(mockUser, context);
    expect(mockRule).toHaveBeenCalledWith(true, context);
  });

  it("should handle null values same as undefined", async () => {
    const nullUser: TestUser = {
      name: "Null",
      profile: null as any,
    };

    const rule = pick(
      (user: TestUser) => user.profile?.verified,
      mockRule,
      true, // default
    );

    const result = await rule(nullUser);
    expect(mockRule).toHaveBeenCalledWith(true, undefined);
    expect(result).toEqual(pass());
  });

  it("should propagate errors from getter function", async () => {
    const errorUser: TestUser = {
      name: "Error",
      get profile(): any {
        throw new Error("Getter error");
      },
    };

    const rule = pick(
      (user: any) => user.profile.verified,
      mockRule,
      true, // default
    );

    expect(rule(errorUser)).rejects.toThrow("Getter error");
  });

  it("should fail when default value is undefined", async () => {
    const rule = pick(
      (user: TestUser) => user.age,
      (age: number) => (age > 18 ? pass() : fail("Too young")),
      undefined, // explicit undefined default
    );

    const noAgeUser: TestUser = { name: "No Age" };
    const result = await rule(noAgeUser);
    expect(result).toEqual(fail("Missing required value"));
  });

  it("should work with falsy default values", async () => {
    const rule = pick(
      (user: TestUser) => user.age,
      (age: number) => (age === 0 ? pass() : fail("Not zero")),
      0, // falsy default
    );

    const result = await rule({ name: "Test" });
    expect(result).toEqual(pass());
  });

  it("should handle async rules", async () => {
    const asyncRule: Rule<boolean> = async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return value ? pass() : fail("Async failed");
    };

    const rule = pick((user: TestUser) => user.profile?.verified, asyncRule);

    const result = await rule(mockUser);
    expect(result).toEqual(pass());
  });
});

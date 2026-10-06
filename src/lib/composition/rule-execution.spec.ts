import { describe, expect, it } from "vitest";
import { fail, pass } from "../helpers";
import type { Rule } from "../types";
import { prepareRuleExecution } from "./rule-execution";

describe("prepareRuleExecution", () => {
  it("snapshots rules and executes them forward with fail-fast behavior", async () => {
    const calls: string[] = [];
    const first: Rule<unknown> = () => {
      calls.push("first");
      return fail("first error");
    };
    const later: Rule<unknown> = () => {
      calls.push("later");
      return pass();
    };
    const rules = [first, later];
    const execute = prepareRuleExecution(rules, {}, "forwardFailFast");
    rules.reverse();

    await expect(execute({})).resolves.toEqual(fail("first error"));
    expect(calls).toEqual(["first"]);
  });

  it("executes in reverse order", async () => {
    const calls: string[] = [];
    const rules: Rule<unknown>[] = [
      () => {
        calls.push("first");
        return pass();
      },
      () => {
        calls.push("last");
        return pass();
      },
    ];

    await expect(
      prepareRuleExecution(rules, {}, "reverseFailFast")({}),
    ).resolves.toEqual(pass());
    expect(calls).toEqual(["last", "first"]);
  });

  it("collects parallel failures in rule order for mixed sync and async rules", async () => {
    const rules: Rule<unknown>[] = [
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return fail("first");
      },
      () => fail("second"),
      () => pass(),
    ];

    await expect(
      prepareRuleExecution(rules, {}, "parallelCollect")({}),
    ).resolves.toEqual(fail(["first", "second"]));
  });

  it("passes one cloned context to every child rule", async () => {
    const contexts: unknown[] = [];
    const rules: Rule<unknown, string, { count: number }>[] = [
      (_, context) => {
        contexts.push(context);
        context!.count += 1;
        return pass();
      },
      (_, context) => {
        contexts.push(context);
        return context!.count === 1 ? pass() : fail("not shared");
      },
    ];
    const original = { count: 0 };
    const execute = prepareRuleExecution(
      rules,
      { cloneContext: true, cloneStrategy: "shallow" },
      "forwardFailFast",
    );

    await expect(execute({}, original)).resolves.toEqual(pass());
    await expect(execute({}, original)).resolves.toEqual(pass());
    expect(contexts[0]).toBe(contexts[1]);
    expect(contexts[2]).toBe(contexts[3]);
    expect(contexts[0]).not.toBe(contexts[2]);
    expect(original.count).toBe(0);
  });

  it("applies safety options to thrown errors", async () => {
    const throws: Rule<unknown, string> = () => {
      throw new Error("boom");
    };
    const safe = prepareRuleExecution(
      [throws],
      { errorTransform: () => "transformed" },
      "forwardFailFast",
    );
    const unsafe = prepareRuleExecution(
      [throws],
      { errorHandlingMode: "unsafe" },
      "forwardFailFast",
    );

    await expect(safe({})).resolves.toEqual(fail("transformed"));
    await expect(unsafe({})).rejects.toThrow("boom");
  });
});

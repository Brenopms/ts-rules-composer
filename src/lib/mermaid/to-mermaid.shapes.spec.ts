import { describe, expect, it, vi } from "vitest";

import {
  every,
  ifElse,
  match,
  not,
  oneOf,
  pass,
  pipeRules,
  tap,
  unless,
  validateField,
  when,
  withFallback,
} from "../index";
import { toMermaid as printDefault } from "./to-mermaid";
import {
  getTotal,
  hasItems,
  isLarge,
  isRetryable,
  lines,
  logOrder,
  positive,
  tier,
  toMermaid,
  withinLimit,
} from "./to-mermaid.fixtures";

describe("toMermaid node shapes", () => {
  it("draws when as a diamond with a yes edge and a no edge that skips the rule", () => {
    expect(toMermaid(when(isLarge, withinLimit))).toBe(
      lines(
        "  input([input])",
        '  root{"isLarge"}',
        '  root_ifTrue["withinLimit"]',
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root",
        '  root -->|"yes"| root_ifTrue',
        "  root_ifTrue --> passed",
        '  root -->|"no"| passed',
        '  root_ifTrue -.->|"fail"| failed',
      ),
    );
  });

  it("draws unless with the rule on the no side", () => {
    expect(toMermaid(unless(isLarge, withinLimit))).toBe(
      lines(
        "  input([input])",
        '  root{"isLarge"}',
        '  root_ifFalse["withinLimit"]',
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root",
        '  root -->|"no"| root_ifFalse',
        '  root -->|"yes"| passed',
        "  root_ifFalse --> passed",
        '  root_ifFalse -.->|"fail"| failed',
      ),
    );
  });

  it("draws ifElse with both sides", () => {
    expect(toMermaid(ifElse(isLarge, withinLimit, hasItems))).toBe(
      lines(
        "  input([input])",
        '  root{"isLarge"}',
        '  root_ifTrue["withinLimit"]',
        '  root_ifFalse["hasItems"]',
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root",
        '  root -->|"yes"| root_ifTrue',
        '  root -->|"no"| root_ifFalse',
        "  root_ifTrue --> passed",
        "  root_ifFalse --> passed",
        '  root_ifTrue -.->|"fail"| failed',
        '  root_ifFalse -.->|"fail"| failed',
      ),
    );
  });

  it("draws match with one labelled edge per case and a default failure", () => {
    const rule = match(
      tier,
      { large: withinLimit, small: hasItems },
      "Unknown tier",
    );

    expect(toMermaid(rule)).toBe(
      lines(
        "  input([input])",
        '  root{"tier"}',
        '  root_cases_0["withinLimit"]',
        '  root_cases_1["hasItems"]',
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root",
        '  root -->|"large"| root_cases_0',
        '  root -->|"small"| root_cases_1',
        "  root_cases_0 --> passed",
        "  root_cases_1 --> passed",
        '  root_cases_0 -.->|"fail"| failed',
        '  root_cases_1 -.->|"fail"| failed',
        '  root -.->|"default"| failed',
      ),
    );
  });

  it("draws match without a default as a no-match failure", () => {
    const text = toMermaid(
      match(tier, { large: withinLimit, small: hasItems }),
    );

    expect(text).toContain('root -.->|"no match"| failed');
  });

  it("draws a match default rule on a default edge", () => {
    const text = toMermaid(
      match(tier, { large: withinLimit, small: hasItems }, hasItems),
    );

    expect(text).toContain('root -->|"default"| root_default');
    expect(text).not.toContain('root -.->|"no match"| failed');
  });

  it("draws every as a fork and join where any failure fails the group", () => {
    expect(toMermaid(every([withinLimit, hasItems]))).toBe(
      lines(
        "  input([input])",
        '  subgraph root_sg["all must pass"]',
        '  root_in(("fork"))',
        '  root_rules_0["withinLimit"]',
        '  root_rules_1["hasItems"]',
        '  root_out(("join"))',
        "  end",
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root_in",
        "  root_in --> root_rules_0",
        "  root_rules_0 --> root_out",
        "  root_in --> root_rules_1",
        "  root_rules_1 --> root_out",
        "  root_out --> passed",
        '  root_out -.->|"fail"| failed',
      ),
    );
  });

  it("draws oneOf as a fork and join that fails only when all fail", () => {
    const text = toMermaid(oneOf([withinLimit, hasItems]));

    expect(text).toContain('subgraph root_sg["at least one must pass"]');
    expect(text).toContain("root_out --> passed");
    expect(text).not.toContain("root_rules_0 -.->");
  });

  it("draws not as a gate that fails when the inner rule passes", () => {
    expect(toMermaid(not(hasItems, "Must be empty"))).toBe(
      lines(
        "  input([input])",
        '  subgraph root_sg["not"]',
        '  root_rule["hasItems"]',
        "  end",
        '  root_gate{"inner failed?"}',
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root_rule",
        "  root_rule --> root_gate",
        '  root_gate -->|"yes"| passed',
        '  root_gate -.->|"no"| failed',
      ),
    );
  });

  it("reads on its own for a not gate when fail edges are off", () => {
    const text = printDefault(not(hasItems, "must not pass"));

    expect(text).toContain('root_gate{"inner failed?"}');
    expect(text).toContain('root_gate -->|"yes"| passed');
    expect(text).not.toContain("failed(");
  });

  it("draws withFallback with a dotted on-fail edge to the fallback", () => {
    const rule = withFallback(hasItems, withinLimit, {
      onlyFallbackOn: isRetryable,
    });

    expect(toMermaid(rule)).toBe(
      lines(
        "  input([input])",
        '  root_main["hasItems"]',
        '  root_fallback["withinLimit"]',
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root_main",
        '  root_main -.->|"on fail if isRetryable"| root_fallback',
        "  root_main --> passed",
        "  root_fallback --> passed",
        '  root_main -.->|"fail"| failed',
        '  root_fallback -.->|"fail"| failed',
      ),
    );
  });

  it("sends only the fallback's failure to failed when there is no guard", () => {
    const text = toMermaid(withFallback(hasItems, withinLimit));

    expect(text).toContain('root_main -.->|"on fail"| root_fallback');
    expect(text).not.toContain('root_main -.->|"fail"| failed');
    expect(text).toContain('root_fallback -.->|"fail"| failed');
  });

  it("draws validateField as a labelled group around the rule", () => {
    expect(toMermaid(validateField(getTotal, positive))).toBe(
      lines(
        "  input([input])",
        '  subgraph root_sg["field: getTotal"]',
        '  root_rule["positive"]',
        "  end",
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root_rule",
        "  root_rule --> passed",
        '  root_rule -.->|"fail"| failed',
      ),
    );
  });

  it("draws tap as a rounded node that cannot fail", () => {
    expect(toMermaid(tap(logOrder))).toBe(
      lines(
        "  input([input])",
        '  root("logOrder")',
        "  passed([passed])",
        "  input --> root",
        "  root --> passed",
      ),
    );
  });

  it("composes shapes: a branch inside a sequence continues from both sides", () => {
    const text = toMermaid(pipeRules([when(isLarge, withinLimit), hasItems]));

    expect(text).toContain("root_steps_0_ifTrue --> root_steps_1");
    expect(text).toContain('root_steps_0 -->|"no"| root_steps_1');
    expect(text).toContain("root_steps_1 --> passed");
  });

  it("escapes edge labels, such as match case keys", () => {
    const text = toMermaid(
      match(tier, { 'a"]; click x': withinLimit } as never),
    );

    expect(text).toContain('  root -->|"a#34;#93;#59; click x"| root_cases_0');
    expect(text).not.toMatch(/^\s*click\b/m);
  });

  it("never invokes anything while drawing every shape", () => {
    const spy = vi.fn(() => pass());
    const selector = vi.fn(() => "a" as const);
    const test = vi.fn(() => true);
    toMermaid(
      pipeRules([
        when(test, spy),
        match(selector, { a: spy }, spy),
        every([spy, oneOf([spy]) as never]) as never,
        not(spy, "x"),
        withFallback(spy, spy),
      ]),
    );

    for (const fn of [spy, selector, test]) expect(fn).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { named } from "../graph/named";
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
  withTimeout,
} from "../index";
import { toMermaid } from "./to-mermaid";

const hasItems = () => pass();
const withinLimit = () => pass();

describe("toMermaid (skeleton)", () => {
  it("starts with a top-down flowchart header", () => {
    expect(toMermaid(hasItems).split("\n")[0]).toBe("flowchart TD");
  });

  it("renders a single rule between input and passed", () => {
    expect(toMermaid(hasItems)).toBe(
      [
        "flowchart TD",
        "  input([input])",
        '  root["hasItems"]',
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root",
        "  root --> passed",
        '  root -.->|"fail"| failed',
      ].join("\n"),
    );
  });

  it("chains the steps of a pipeRules sequence in order", () => {
    const text = toMermaid(pipeRules([hasItems, withinLimit]));

    expect(text).toContain('root_steps_0["hasItems"]');
    expect(text).toContain('root_steps_1["withinLimit"]');
    expect(text).toContain("input --> root_steps_0");
    expect(text).toContain("root_steps_0 --> root_steps_1");
    expect(text).toContain("root_steps_1 --> passed");
    expect(text).toContain('root_steps_0 -.->|"fail"| failed');
    expect(text).toContain('root_steps_1 -.->|"fail"| failed');
  });

  it("is deterministic", () => {
    const rule = pipeRules([hasItems, withinLimit]);
    expect(toMermaid(rule)).toBe(toMermaid(rule));
  });

  it("never invokes the rules it describes", () => {
    const spy = vi.fn(() => pass());
    toMermaid(pipeRules([spy, spy]));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("toMermaid label escaping", () => {
  const render = (label: string) =>
    toMermaid(pipeRules([named(label, () => pass())]));

  it("keeps a hostile label on one inert node line", () => {
    const text = render(
      'ok"]\n  click root call alert(1)\n  %%{init: {"securityLevel":"loose"}}%%',
    );
    const lines = text.split("\n");

    expect(lines).toHaveLength(8);
    expect(lines.some((line) => /^\s*click\b/.test(line))).toBe(false);
    expect(text).not.toContain("%%");
  });

  it("leaves only the two delimiting quotes in a node line", () => {
    const nodeLine = render('a"b').split("\n")[2];

    expect(nodeLine.match(/"/g)).toHaveLength(2);
  });

  it.each([
    ["newline", "a\nb"],
    ["carriage return", "a\rb"],
    ["line separator", "a\u2028b"],
    ["tab", "a\tb"],
  ])("never emits a raw %s", (_name, label) => {
    const text = render(label);

    expect(text.split("\n")).toHaveLength(8);
    expect(text).not.toMatch(/[\r\t\u2028\u2029]/);
  });

  it.each(["[", "]", "{", "}", "(", ")", "|", "<", ">", ";", "`", "%", "#"])(
    "encodes %s inside a label",
    (char) => {
      const nodeLine = render(`a${char}b`).split("\n")[2];
      const inner = nodeLine.slice(nodeLine.indexOf('"') + 1, -2);

      expect(inner).toBe(`a#${char.codePointAt(0)};b`);
    },
  );

  it("keeps letters, digits, spaces and common punctuation readable", () => {
    expect(render("Min age: 18 - Café_1.5, ok/yes")).toContain(
      '["Min age: 18 - Café_1.5, ok/yes"]',
    );
  });
});

const lines = (...rows: string[]) => ["flowchart TD", ...rows].join("\n");
const isLarge = () => true;
const isRetryable = () => true;
const tier = (): "large" | "small" => "large";
const getTotal = (order: { total: number }) => order.total;
const positive = () => pass();
const logOrder = () => {};

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
        '  root_gate{"inner passed?"}',
        "  passed([passed])",
        "  failed([failed])",
        "  input --> root_rule",
        "  root_rule --> root_gate",
        '  root_gate -->|"no"| passed',
        '  root_gate -.->|"yes"| failed',
      ),
    );
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

  it("looks through a decorator until badges are drawn", () => {
    const text = toMermaid(withTimeout(hasItems, 5, "Timed out"));

    expect(text).toContain('root_rule["hasItems"]');
    expect(text).not.toContain("decorator");
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

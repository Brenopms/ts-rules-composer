import { describe, expect, it, vi } from "vitest";

import { named } from "../graph/named";
import { attachNode } from "../graph/node";
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

describe("toMermaid edge cases", () => {
  it("draws an empty pipeline as a rounded node that cannot fail", () => {
    expect(toMermaid(pipeRules([]))).toBe(
      lines(
        "  input([input])",
        '  root("no rules")',
        "  passed([passed])",
        "  input --> root",
        "  root --> passed",
      ),
    );
  });

  it.each([
    ["every", () => every([])],
    ["oneOf", () => oneOf([])],
  ])("draws an empty %s as a fork joined straight through", (_name, build) => {
    const text = toMermaid(build());

    expect(text).toContain("root_in --> root_out");
    expect(text).toContain("root_out --> passed");
    expect(text).not.toContain("failed");
  });

  it("draws a node kind it does not know as a leaf", () => {
    const unknown = attachNode(
      function futureRule() {
        return pass();
      },
      { kind: "mystery" } as never,
    );

    expect(toMermaid(pipeRules([unknown, hasItems]))).toContain(
      'root_steps_0["futureRule"]',
    );
  });

  describe("a pipeline using every shape at once", () => {
    const build = () =>
      pipeRules<unknown, string | string[]>([
        when(isLarge, ifElse(isLarge, withinLimit, hasItems)),
        match(
          tier,
          {
            large: every([withinLimit, not(hasItems, "no")]) as never,
            small: oneOf([withFallback(hasItems, withinLimit)]) as never,
          },
          validateField(getTotal, positive) as never,
        ),
        tap(logOrder),
        withTimeout(unless(isLarge, hasItems), 5, "Timed out"),
      ]);

    const declared = (text: string) =>
      [...text.matchAll(/^ {2}(\w+)(?:\(|\[|\{)/gm)].map((m) => m[1]);
    const referenced = (text: string) =>
      [
        ...text.matchAll(/^ {2}(\w+) -[.-]?->(?:\|"[^"]*"\|)? (\w+)$/gm),
      ].flatMap((m) => [m[1], m[2]]);

    it("is deterministic", () => {
      expect(toMermaid(build())).toBe(toMermaid(build()));
    });

    it("declares each node once and every edge ends on a declared node", () => {
      const text = toMermaid(build());
      const nodes = declared(text);

      expect(new Set(nodes).size).toBe(nodes.length);
      for (const id of referenced(text)) {
        expect(nodes).toContain(id);
      }
    });

    it("closes every group it opens", () => {
      const lines = toMermaid(build()).split("\n");
      const opened = lines.filter((line) => /^ {2}subgraph /.test(line));
      const closed = lines.filter((line) => line === "  end");

      expect(opened.length).toBeGreaterThan(2);
      expect(closed).toHaveLength(opened.length);
    });
  });

  describe("options", () => {
    const rule = pipeRules([hasItems, withinLimit]);

    it("direction switches the flowchart header", () => {
      expect(toMermaid(rule, { direction: "LR" }).split("\n")[0]).toBe(
        "flowchart LR",
      );
    });

    it("leaves fail edges off by default", () => {
      const text = printDefault(rule);

      expect(text).not.toContain("failed");
      expect(text).not.toContain("-.->");
      expect(text).toBe(printDefault(rule, { failEdges: false }));
    });

    it("failEdges: true adds the failed terminal and a dotted edge per failing step", () => {
      const text = printDefault(rule, { failEdges: true });

      expect(text).toContain("failed([failed])");
      expect(text).toContain('root_steps_1 -.->|"fail"| failed');
    });

    it("failEdges: false drops the failed terminal and its edges", () => {
      const text = toMermaid(rule, { failEdges: false });

      expect(text).not.toContain("failed");
      expect(text).not.toContain("-.->");
      expect(text).toContain("root_steps_1 --> passed");
    });

    it("failEdges: false keeps fallback routing", () => {
      const text = toMermaid(withFallback(hasItems, withinLimit), {
        failEdges: false,
      });

      expect(text).toContain('-.->|"on fail"|');
    });

    it("maxLabelLength truncates long labels with an ellipsis", () => {
      const longName = named("a_very_long_rule_name_indeed", hasItems);
      const text = toMermaid(longName, { maxLabelLength: 10 });

      expect(text).toContain('["a_very_lo#8230;"]');
    });

    it("maxLabelLength also truncates test, case and guard text but not badges", () => {
      const isLongPredicate = named("isLongPredicateName", () => true);
      const text = toMermaid(
        withTimeout(when(isLongPredicate, hasItems), 500, "late"),
        { maxLabelLength: 6 },
      );

      expect(text).toContain('{"isLon#8230;"}');
      expect(text).toContain("500ms");
    });

    it("falls back to TD for a direction outside the allowlist", () => {
      const evil = "TD\n  click root call alert(1)" as never;
      const text = toMermaid(rule, { direction: evil });

      expect(text.split("\n")[0]).toBe("flowchart TD");
      expect(text).not.toContain("click");
    });

    it("never exceeds maxLabelLength, even for tiny or odd values", () => {
      const name = named("abcdef", hasItems);
      const label = (max: number) =>
        toMermaid(name, { maxLabelLength: max }).match(/root\["(.*)"\]/)?.[1];

      expect(label(1)).toBe("a#8230;");
      expect(label(0)).toBe("a#8230;");
      expect(label(-5)).toBe("a#8230;");
      expect(label(3)).toBe("ab#8230;");
      expect(label(Number.NaN)).toBe("abcdef");
      expect(label(Number.POSITIVE_INFINITY)).toBe("abcdef");
    });

    it("maxLabelLength truncates case keys and guards", () => {
      const sw = match((i: string) => i, { averyLongCaseKey: hasItems });
      const guarded = withFallback(hasItems, withinLimit, {
        onlyFallbackOn: named("isRetryableErrorName", isRetryable),
      });

      expect(toMermaid(sw, { maxLabelLength: 5 })).toContain('|"aver#8230;"|');
      expect(toMermaid(guarded, { maxLabelLength: 12 })).toContain(
        '|"on fail if isRetryable#8230;"|',
      );
    });

    it("maxLabelLength truncates validateField getter names", () => {
      const field = validateField(
        named("averyLongGetterName", (i: { total: number }) => i.total),
        positive,
      );

      expect(toMermaid(field, { maxLabelLength: 8 })).toContain(
        'subgraph root_sg["field: averyLo#8230;"]',
      );
    });

    it("defaults to 40 characters", () => {
      const text = toMermaid(named("x".repeat(60), hasItems));

      expect(text).toContain(`["${"x".repeat(39)}#8230;"]`);
    });
  });
});

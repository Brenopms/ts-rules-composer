import { describe, expect, it, vi } from "vitest";
import { named } from "../graph/named";
import { attachNode } from "../graph/node";
import {
  every,
  ifElse,
  mapError,
  match,
  not,
  oneOf,
  pass,
  pipeRules,
  tap,
  unless,
  validateField,
  when,
  withDebug,
  withFallback,
  withMemoize,
  withRetry,
  withTap,
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

describe("toMermaid adversarial escaping", () => {
  const hostile = [
    '"]; click x call alert(1)',
    '%%{init: {"securityLevel":"loose"}}%%',
    'a\nclick root href "javascript:alert(1)"',
    "x --> y\n  style root fill:red",
    "`<img src=x onerror=alert(1)>`",
    "end\n  subgraph evil",
    "\u202Ertl\u2028\u2029",
  ];

  // Every line our printer can emit. Quoted text may hold only plain letters,
  // digits, spaces, `_.,:/-` and numeric entities such as `#34;`.
  const text = String.raw`(?:[\p{L}\p{N} _.,:/?-]|#\d+;)*`;
  const id = String.raw`[A-Za-z0-9_]+`;
  const allowed = [
    /^flowchart (TD|LR)$/,
    new RegExp(
      `^ {2}${id}(?:\\(\\(|\\(\\[|\\(|\\[|\\{)"${text}"(?:\\)\\)|\\]\\)|\\)|\\]|\\})$`,
      "u",
    ),
    new RegExp(`^ {2}${id}(?:\\(\\(|\\(\\[)[a-z]+(?:\\)\\)|\\]\\))$`, "u"),
    new RegExp(`^ {2}subgraph ${id}\\["${text}"\\]$`, "u"),
    /^ {2}end$/,
    new RegExp(`^ {2}${id} (?:-->|-\\.->)(?:\\|"${text}"\\|)? ${id}$`, "u"),
  ];

  const hostilePipeline = (bad: string) =>
    pipeRules([
      named(bad, () => pass()),
      when(
        named(bad, () => true),
        named(bad, () => pass()),
      ),
      match(
        named(bad, () => "k"),
        {
          [bad]: named(bad, () => pass()),
        },
      ),
      validateField(
        named(bad, () => 1),
        named(bad, () => pass()),
      ),
      withFallback(
        named(bad, () => pass()),
        named(bad, () => pass()),
        {
          onlyFallbackOn: named(bad, () => true),
        },
      ),
      withTimeout(
        named(bad, () => pass()),
        5,
        bad,
      ),
      every([named(bad, () => pass())]) as never,
      not(
        named(bad, () => pass()),
        bad,
      ),
    ]);

  it.each(hostile)(
    "keeps every line inside the printer's grammar: %j",
    (bad) => {
      const output = toMermaid(hostilePipeline(bad), { verbose: true });

      for (const line of output.split("\n")) {
        expect(
          allowed.some((pattern) => pattern.test(line)),
          line,
        ).toBe(true);
      }
    },
  );

  it.each(hostile)("never lets a statement keyword start a line: %j", (bad) => {
    const output = toMermaid(hostilePipeline(bad));

    expect(output).not.toMatch(
      /^\s*(click|style|classDef|linkStyle|class|href)\b/m,
    );
    expect(output).not.toContain("%%");
  });

  it("opens and closes the same number of groups however hostile the names", () => {
    const output = toMermaid(hostilePipeline("end\n  subgraph evil"));
    const outputLines = output.split("\n");

    expect(outputLines.filter((l) => /^ {2}subgraph /.test(l))).toHaveLength(
      outputLines.filter((l) => l === "  end").length,
    );
  });

  it("turns the documented attack string into inert text", () => {
    const output = toMermaid(named('"]; click x call alert(1)', () => pass()));

    expect(output).toContain('["#34;#93;#59; click x call alert#40;1#41;"]');
  });

  it("encodes astral characters as one entity, not two surrogates", () => {
    expect(toMermaid(named("a😀b", () => pass()))).toContain('["a#128512;b"]');
  });

  it("does not echo a hostile non-string badge param", () => {
    const odd = attachNode(
      function inner() {
        return pass();
      },
      {
        kind: "decorator",
        decorator: "timeout",
        rule: hasItems,
        params: { ms: { toString: () => '"]; click x' } },
      },
    );

    expect(toMermaid(odd)).not.toContain("click");
  });

  it("never invokes hostile getters or names", () => {
    const spy = vi.fn(() => pass());
    toMermaid(named('"]; click', spy));
    expect(spy).not.toHaveBeenCalled();
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
      for (const id of referenced(text)) expect(nodes).toContain(id);
    });

    it("closes every group it opens", () => {
      const lines = toMermaid(build()).split("\n");
      const opened = lines.filter((line) => /^ {2}subgraph /.test(line));
      const closed = lines.filter((line) => line === "  end");

      expect(opened.length).toBeGreaterThan(2);
      expect(closed).toHaveLength(opened.length);
    });
  });
  describe("decorator badges", () => {
    const byItems = () => "k";

    it("shows timeout, retry and memoize as badges on the wrapped rule", () => {
      expect(toMermaid(withTimeout(hasItems, 500, "late"))).toContain(
        'root_rule["hasItems #9201; 500ms"]',
      );
      expect(toMermaid(withRetry(hasItems, { attempts: 3 }))).toContain(
        'root_rule["hasItems #8635; 3x"]',
      );
      expect(toMermaid(withMemoize(hasItems, byItems))).toContain(
        'root_rule["hasItems #9889; cached"]',
      );
    });

    it("stacks badges from nested decorators", () => {
      const text = toMermaid(
        withTimeout(withRetry(hasItems, { attempts: 2 }), 5, "late"),
      );

      expect(text).toContain('["hasItems #9201; 5ms #8635; 2x"]');
    });

    it("titles a group with the badges when the decorated rule is composite", () => {
      const text = toMermaid(
        withTimeout(pipeRules([hasItems, withinLimit]), 5, "late"),
      );

      expect(text).toContain('subgraph root_rule_badge_sg["#9201; 5ms"]');
      expect(text.match(/^ {2}end$/gm)).toHaveLength(1);
    });

    it("hides debug, tap and mapError plumbing unless verbose", () => {
      const rules = [
        withDebug(hasItems, "audit"),
        withTap(() => undefined)(hasItems),
        mapError(hasItems, (e: string) => e),
      ];
      const words = ["debug", "tap", "mapError"];
      rules.forEach((rule, i) => {
        expect(toMermaid(rule)).not.toContain("#");
        expect(toMermaid(rule, { verbose: true })).toMatch(
          new RegExp(`\\["\\w+ ${words[i]}"\\]`),
        );
      });
    });

    it("keeps real badges when verbose is off even under plumbing", () => {
      const text = toMermaid(withDebug(withTimeout(hasItems, 5, "x"), "a"));

      expect(text).toContain('["a #9201; 5ms"]');
    });
  });

  describe("decorator badges: leaves and edge cases", () => {
    it("badges an effect leaf", () => {
      const text = toMermaid(withTimeout(tap(logOrder), 5, "late"));

      expect(text).toMatch(/\("[^"]*#9201; 5ms"\)/);
    });

    it("badges an unknown-kind leaf", () => {
      const unknown = attachNode(
        function futureRule() {
          return pass();
        },
        { kind: "mystery" } as never,
      );

      expect(toMermaid(withTimeout(unknown, 5, "late"))).toContain(
        '["futureRule #9201; 5ms"]',
      );
    });

    it("titles a group with a plumbing decorator when verbose", () => {
      const rule = withDebug(pipeRules([hasItems, withinLimit]), "audit");

      expect(toMermaid(rule, { verbose: true })).toContain('["debug"]');
      expect(toMermaid(rule)).not.toContain("_badge_sg");
    });

    it("shows a placeholder when a badge param is missing", () => {
      const odd = attachNode(
        function inner() {
          return pass();
        },
        { kind: "decorator", decorator: "timeout", rule: hasItems, params: {} },
      );

      expect(toMermaid(odd)).toContain("#9201; #63;ms");
      expect(toMermaid(odd)).not.toContain("undefined");
    });
  });

  describe("options", () => {
    const rule = pipeRules([hasItems, withinLimit]);

    it("direction switches the flowchart header", () => {
      expect(toMermaid(rule, { direction: "LR" }).split("\n")[0]).toBe(
        "flowchart LR",
      );
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

    it("defaults to 40 characters", () => {
      const text = toMermaid(named("x".repeat(60), hasItems));

      expect(text).toContain(`["${"x".repeat(39)}#8230;"]`);
    });
  });
});

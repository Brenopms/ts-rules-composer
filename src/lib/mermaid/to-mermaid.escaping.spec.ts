import { describe, expect, it, vi } from "vitest";

import { named } from "../graph/named";
import { attachNode } from "../graph/node";
import {
  every,
  match,
  not,
  pass,
  pipeRules,
  validateField,
  when,
  withFallback,
  withTimeout,
} from "../index";
import { hasItems, toMermaid } from "./to-mermaid.fixtures";

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

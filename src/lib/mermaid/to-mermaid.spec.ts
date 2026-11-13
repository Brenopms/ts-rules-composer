import { describe, expect, it, vi } from "vitest";
import { pipeRules } from "../composition/pipe-rules";
import { named } from "../graph/named";
import { pass } from "../helpers/result/pass";
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
        "  input --> root",
        "  root --> passed",
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

    expect(lines).toHaveLength(6);
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

    expect(text.split("\n")).toHaveLength(6);
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

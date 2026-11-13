import { describe, expect, it, vi } from "vitest";
import { pipeRules } from "../composition/pipe-rules";
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

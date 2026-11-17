import { describe, expect, it } from "vitest";

import { attachNode } from "../graph/node";
import {
  mapError,
  pass,
  pipeRules,
  tap,
  withDebug,
  withLazyContext,
  withMemoize,
  withRetry,
  withTap,
  withTimeout,
} from "../index";
import {
  hasItems,
  logOrder,
  toMermaid,
  withinLimit,
} from "./to-mermaid.fixtures";

describe("toMermaid edge cases", () => {
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

    it("draws the rules inside withLazyContext and hides the wrapper unless verbose", () => {
      const rule = withLazyContext(
        async () => ({}),
        pipeRules([hasItems, withinLimit]),
      );

      const plain = toMermaid(rule);
      expect(plain).toContain('["hasItems"]');
      expect(plain).toContain('["withinLimit"]');
      expect(plain).not.toContain("_badge_sg");
      expect(toMermaid(rule, { verbose: true })).toContain(
        'subgraph root_rule_badge_sg["lazyContext"]',
      );
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
});

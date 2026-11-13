import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { type Entry, PACKAGE_NAME, runInConsumer } from "./helpers";

const EXPORTS = [
  "calculateDelay",
  "composeRules",
  "every",
  "fail",
  "getNormalizedRule",
  "getNormalizedRules",
  "hasContext",
  "ifElse",
  "inject",
  "mapError",
  "match",
  "named",
  "not",
  "oneOf",
  "pass",
  "pipe",
  "pipeRules",
  "requireContextRule",
  "tap",
  "toGraph",
  "unless",
  "validateField",
  "when",
  "withDebug",
  "withFallback",
  "withLazyContext",
  "withMemoize",
  "withRetry",
  "withSafeError",
  "withSafePredicate",
  "withTap",
  "withTimeout",
] as const;

const installedDir = () =>
  join(inject("projectDir"), "node_modules", PACKAGE_NAME);

const listFiles = (dir: string, prefix = ""): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );

describe.each<Entry>(["esm", "cjs"])("installed package (%s)", (entry) => {
  it("exposes exactly the pinned named exports", () => {
    const names = runInConsumer<string[]>(
      inject("projectDir"),
      entry,
      "return Object.keys(m).sort();",
    );
    expect(names).toEqual([...EXPORTS]);
  });
});

describe.each<Entry>(["esm", "cjs"])(
  "installed ts-rules-composer/mermaid (%s)",
  (entry) => {
    const run = <T>(body: string) =>
      runInConsumer<T>(
        inject("projectDir"),
        entry,
        body,
        `${PACKAGE_NAME}/mermaid`,
      );

    it("exposes exactly toMermaid", () => {
      expect(run<string[]>("return Object.keys(m).sort();")).toEqual([
        "toMermaid",
      ]);
    });

    it("renders a pipeline built by the main entry", () => {
      const loadMain =
        entry === "esm"
          ? `await import("${PACKAGE_NAME}")`
          : `require("${PACKAGE_NAME}")`;
      const text = run<string>(
        `const main = ${loadMain};
         const a = () => main.pass();
         return m.toMermaid(main.pipeRules([a]));`,
      );
      expect(text).toContain("flowchart TD");
      expect(text).toContain('root_steps_0["a"]');
    });
  },
);

describe("installed package contents", () => {
  it("ships the built files and metadata, and nothing from src or tests", () => {
    const files = listFiles(installedDir());

    expect(files).toEqual(
      expect.arrayContaining([
        "dist/index.js",
        "dist/index.cjs",
        "dist/index.d.ts",
        "dist/index.d.cts",
        "dist/mermaid.js",
        "dist/mermaid.cjs",
        "dist/mermaid.d.ts",
        "dist/mermaid.d.cts",
        "package.json",
        "README.md",
        "LICENSE",
      ]),
    );
    const leaked = files.filter(
      (file) =>
        !file.startsWith("dist/") &&
        !/^(package\.json|README\.md|LICENSE)$/.test(file),
    );
    expect(leaked).toEqual([]);
  });

  it("has type declaration files for both entry points", () => {
    const pkg = JSON.parse(
      readFileSync(join(installedDir(), "package.json"), "utf8"),
    ) as {
      exports: Record<string, Record<"import" | "require", { types: string }>>;
    };
    const root = pkg.exports["."];

    for (const condition of ["import", "require"] as const) {
      expect(existsSync(join(installedDir(), root[condition].types))).toBe(
        true,
      );
    }
  });
});

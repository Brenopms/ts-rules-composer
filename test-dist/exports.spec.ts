import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

describe.each<[Entry, Entry]>([
  ["esm", "cjs"],
  ["cjs", "esm"],
])(
  "ts-rules-composer/mermaid (%s printer) reading a pipeline built by the %s entry",
  (printer, builder) => {
    it("describes named rules, badges and the graph", () => {
      // The builder entry is loaded from inside the printer's own process.
      const loadMain =
        builder === "esm"
          ? `await import("${PACKAGE_NAME}")`
          : `(await import("node:module")).createRequire(process.cwd() + "/")("${PACKAGE_NAME}")`;
      const result = runInConsumer<{ text: string; kind: string }>(
        inject("projectDir"),
        printer,
        `const main = ${loadMain};
         const check = main.named("amount > 10", (n) => n > 10);
         const rule = main.pipeRules([
           main.withTimeout(() => main.pass(), 500, "slow"),
           main.when(check, main.withRetry(() => main.pass(), { attempts: 3 })),
         ]);
         return { text: m.toMermaid(rule), kind: main.toGraph(rule).root.kind };`,
        `${PACKAGE_NAME}/mermaid`,
      );
      expect(result.kind).toBe("sequence");
      expect(result.text).toContain("amount #62; 10");
      expect(result.text).toContain("500ms");
      expect(result.text).toContain("3x");
    });
  },
);

describe("installed package types", () => {
  const importing = `import { pass, pipeRules, toGraph, type RuleGraph } from "${PACKAGE_NAME}";
import { toMermaid, type MermaidOptions } from "${PACKAGE_NAME}/mermaid";
const options: MermaidOptions = { direction: "LR", failEdges: true, verbose: true, maxLabelLength: 20 };
const graph: RuleGraph = toGraph(pipeRules([() => pass()]));
const text: string = toMermaid(pipeRules([() => pass()]), options);
// @ts-expect-error direction is "TD" | "LR"
const bad: MermaidOptions = { direction: "diagonal" };
export { bad, graph, text };
`;

  it.each(["mts", "cts"])(
    "compile for a %s consumer, including MermaidOptions",
    (extension) => {
      const projectDir = inject("projectDir");
      const file = `check.${extension}`;
      writeFileSync(join(projectDir, file), importing);

      // `execFileSync` throws with tsc's output when the types are wrong.
      execFileSync(
        process.execPath,
        [
          join(import.meta.dirname, "..", "node_modules/typescript/bin/tsc"),
          "--noEmit",
          "--strict",
          "--target",
          "es2022",
          "--module",
          "nodenext",
          "--moduleResolution",
          "nodenext",
          file,
        ],
        { cwd: projectDir, encoding: "utf8", stdio: "pipe" },
      );
    },
  );
});

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

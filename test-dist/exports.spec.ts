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
  "not",
  "oneOf",
  "pass",
  "pipe",
  "pipeRules",
  "requireContextRule",
  "tap",
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

describe("installed package contents", () => {
  it("ships the built files and metadata, and nothing from src or tests", () => {
    const files = listFiles(installedDir());

    expect(files).toEqual(
      expect.arrayContaining([
        "dist/index.js",
        "dist/index.cjs",
        "dist/index.d.ts",
        "dist/index.d.cts",
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

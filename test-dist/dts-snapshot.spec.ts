import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, inject, it } from "vitest";
import { PACKAGE_NAME } from "./helpers";

/**
 * Guards the public types: any change to a published declaration file shows
 * up as a snapshot diff. Update with `npm run test:dist -- -u` and review the
 * `.snap` diff like any other API change.
 */

const DECLARATION_FILE = /\.d\.c?ts$/;

/** tsdown names shared chunks `<name>-<8-char hash>.<ext>`. */
const CHUNK_HASH = /-[A-Za-z0-9_-]{8}(?=\.d\.c?ts$)/;
const normalizeName = (name: string) => name.replace(CHUNK_HASH, "-[hash]");

/**
 * Chunk names only appear in relative `from "./…"` specifiers and the
 * trailing source-map comment. Anything else (string literals, JSDoc) is
 * left alone, so a hash-shaped public literal still shows up in a diff.
 */
const CHUNK_REFERENCE =
  /((?:\bfrom\s+["']\.\/|^\/\/# sourceMappingURL=)[\w-]+?)-[A-Za-z0-9_-]{8}(?=\.(?:d\.)?c?[jt]s(?:\.map)?\b)/gm;
const normalizeDeclaration = (content: string) =>
  content.replace(CHUNK_REFERENCE, "$1-[hash]");

it("preserves hash-shaped public literals even when they match a chunk import", () => {
  const content = [
    'export { Report } from "./report-20260101.js";',
    'export type ReportPath = "./report-20260101.js" | "report-20270101.js";',
    "//# sourceMappingURL=report-20260101.d.ts.map",
  ].join("\n");
  expect(normalizeDeclaration(content)).toBe(
    [
      'export { Report } from "./report-[hash].js";',
      'export type ReportPath = "./report-20260101.js" | "report-20270101.js";',
      "//# sourceMappingURL=report-[hash].d.ts.map",
    ].join("\n"),
  );
});

it("keeps the published declaration files unchanged", () => {
  const distDir = join(
    inject("projectDir"),
    "node_modules",
    PACKAGE_NAME,
    "dist",
  );
  const files = readdirSync(distDir)
    .filter((file) => DECLARATION_FILE.test(file))
    .map((file) => ({
      name: normalizeName(file),
      content: normalizeDeclaration(readFileSync(join(distDir, file), "utf8")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // The file list itself is part of the snapshot (one header per file);
  // this only guards against snapshotting an empty or partial install.
  expect(files.map((file) => file.name)).toEqual(
    expect.arrayContaining([
      "index.d.cts",
      "index.d.ts",
      "mermaid.d.cts",
      "mermaid.d.ts",
    ]),
  );
  expect(
    files
      .map((file) => `// ==== ${file.name} ====\n${file.content}`)
      .join("\n"),
  ).toMatchSnapshot();
});

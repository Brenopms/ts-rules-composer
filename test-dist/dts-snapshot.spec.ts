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
const CHUNK_HASH = /\b([a-z][a-z-]*?)-[A-Za-z0-9_-]{8}(?=\.(?:d\.)?c?[jt]s\b)/g;

const normalize = (text: string) => text.replace(CHUNK_HASH, "$1-[hash]");

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
      name: normalize(file),
      content: normalize(readFileSync(join(distDir, file), "utf8")),
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

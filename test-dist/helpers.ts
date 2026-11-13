import { execFileSync } from "node:child_process";

export const PACKAGE_NAME = "ts-rules-composer";

export type Entry = "esm" | "cjs";

const LOADERS: Record<
  Entry,
  { args: string[]; load: (specifier: string) => string }
> = {
  esm: {
    args: ["--input-type=module"],
    load: (specifier) => `const m = await import("${specifier}");`,
  },
  cjs: {
    args: ["--input-type=commonjs"],
    load: (specifier) => `const m = require("${specifier}");`,
  },
};

/**
 * Runs `body` in a fresh Node process inside the consumer project, with the
 * installed package bound to `m` through the given entry point. `specifier`
 * selects the package export to load (default: the main entry). `body` must
 * produce a JSON-serializable value via `return`.
 */
export function runInConsumer<T>(
  projectDir: string,
  entry: Entry,
  body: string,
  specifier: string = PACKAGE_NAME,
): T {
  const { args, load } = LOADERS[entry];
  const script = `${load(specifier)}
const result = await (async () => { ${body} })();
process.stdout.write(JSON.stringify(result));`;
  // CJS has no top-level await, so wrap everything in an async IIFE.
  const wrapped = entry === "cjs" ? `(async () => { ${script} })();` : script;
  const output = execFileSync("node", [...args, "-e", wrapped], {
    cwd: projectDir,
    encoding: "utf8",
  });
  return JSON.parse(output) as T;
}

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    projectDir: string;
  }
}

const ENTRY_FILES = ["dist/index.js", "dist/index.cjs"];

const npm = (args: string[], cwd: string) =>
  execFileSync("npm", args, { cwd, encoding: "utf8", stdio: "pipe" });

/** Packs the package and installs the tarball into a throwaway project. */
export default function setup(project: TestProject) {
  const root = project.config.root;
  const missing = ENTRY_FILES.filter((file) => !existsSync(join(root, file)));
  if (missing.length > 0) {
    throw new Error(
      `Missing build output (${missing.join(", ")}). Run "npm run build" first.`,
    );
  }

  const workDir = mkdtempSync(join(tmpdir(), "ts-rules-composer-dist-"));
  try {
    const packOutput = npm(
      ["pack", "--json", "--ignore-scripts", "--pack-destination", workDir],
      root,
    );
    const [{ filename }] = JSON.parse(packOutput) as [{ filename: string }];

    const projectDir = join(workDir, "consumer");
    mkdirSync(projectDir);
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify({ name: "consumer", version: "0.0.0", private: true }),
    );
    npm(
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        join(workDir, filename),
      ],
      projectDir,
    );

    project.provide("projectDir", projectDir);
    return () => rmSync(workDir, { recursive: true, force: true });
  } catch (error) {
    rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
}

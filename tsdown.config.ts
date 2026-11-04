import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/lib/index.ts"],
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2022",
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  fixedExtension: false,
  publint: true,
  attw: { level: "error", profile: "node16" },
});

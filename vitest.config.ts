import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["html", "json"],
    },
    include: ["src/**/*.{test,spec}.ts"],
  },
});

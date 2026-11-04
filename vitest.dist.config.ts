import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test-dist/**/*.spec.ts"],
    globalSetup: ["test-dist/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});

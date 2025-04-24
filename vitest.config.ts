/// <reference types="vitest" />

// Configure Vitest (https://vitest.dev/config/)

import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    coverage: {
      reporter: ['html', 'json'],
    },
    include: ['src/**/*.{test,spec}.ts'],
    /* for example, use global to avoid globals imports (describe, test, expect): */
    // globals: true,
  },
});

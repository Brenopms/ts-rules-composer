// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  // Entry file(s)
  entry: ['src/lib/index.ts'],
  
  // Output formats
  format: ['cjs', 'esm'],
  
  // Generate declaration files
  dts: true,
  
  // Clean dist folder before build
  clean: true,
  
  // Target ES2018 for good balance
  target: 'es2018',
  
  // Bundle dependencies (adjust based on your needs)
  noExternal: [], // Bundle all dependencies
  // or
  // external: ['some-package'], // Mark specific packages as external
  
  // Enable sourcemaps
  sourcemap: true,
  
  // Optional: Splitting for ESM
  splitting: true,
  
  // Optional: Minification
  minify: true,
  
  // Optional: Tree-shaking
  treeshake: true, 
})
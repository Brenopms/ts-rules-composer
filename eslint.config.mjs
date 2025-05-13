import { defineConfig, globalIgnores } from "eslint/config";
import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import _import from "eslint-plugin-import";
import eslintComments from "eslint-plugin-eslint-comments";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([
    globalIgnores(["**/node_modules", "**/build", "**/coverage", "**/vitest.config.js"]),
    {
        extends: fixupConfigRules(compat.extends(
            "eslint:recommended",
            "plugin:eslint-comments/recommended",
            "plugin:@typescript-eslint/recommended",
            "plugin:import/typescript",
            "prettier",
        )),

        plugins: {
            import: fixupPluginRules(_import),
            "eslint-comments": fixupPluginRules(eslintComments),
        },

        languageOptions: {
            globals: {
                BigInt: true,
                console: true,
                WebAssembly: true,
            },
            parser: tsParser,
            ecmaVersion: 6,
            sourceType: "module",
            parserOptions: {
                project: "./tsconfig.json",
            },
        },

        rules: {
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-unused-vars": [1, {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],
            "eslint-comments/disable-enable-pair": ["error", {
                allowWholeFile: true,
            }],
            "eslint-comments/no-unused-disable": "error",
            "import/order": ["error", {
                "newlines-between": "always",
                alphabetize: {
                    order: "asc",
                },
            }],
            quotes: ["error", "double", {
                allowTemplateLiterals: true,
            }],
             "@typescript-eslint/consistent-type-imports": "error"
        },
    },
    {
        // Override config for test files
        files: ["**/*.spec.ts"],
        rules: {
            // Add any rules you want to disable or modify for test files
            "@typescript-eslint/no-unused-vars": "off",
            "import/order": "off",
            "@typescript-eslint/no-explicit-any": "off"
            // You can add more test-specific rule overrides here
        }
    }
]);

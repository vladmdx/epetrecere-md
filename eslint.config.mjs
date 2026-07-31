import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["scripts/**/*.ts"],
    rules: {
      // Flow/audit fixtures intentionally inspect heterogeneous API payloads.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  {
    files: ["packages/mobile/**/*.{ts,tsx}"],
    rules: {
      // React Native's Image uses accessibilityLabel, not the DOM alt prop.
      "jsx-a11y/alt-text": "off",
    },
  },
  {
    files: ["packages/mobile/**/*.config.js", "packages/mobile/*.config.js"],
    rules: {
      // Expo and Metro configuration files use CommonJS by convention.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // These rules target the optional React Compiler. The project currently
      // uses standard React 19 rendering and does not enable that compiler.
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      // Galleries, uploads, print layouts, and externally hosted vendor media
      // deliberately use native img elements so arbitrary/blob URLs still work.
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".vercel/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

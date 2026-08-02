// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist/**", "**/build/**", "**/coverage/**", "**/.firebase/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // doc 07 §2: packages/shared es dominio puro, no puede importar React
    // ni Firebase — es lo que permite que sus tests corran en milisegundos.
    files: ["packages/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "packages/shared no puede importar React (doc 07 §2)." },
            {
              name: "react-dom",
              message: "packages/shared no puede importar React (doc 07 §2).",
            },
            {
              name: "firebase",
              message: "packages/shared no puede importar Firebase (doc 07 §2).",
            },
            {
              name: "firebase-admin",
              message: "packages/shared no puede importar Firebase (doc 07 §2).",
            },
          ],
          patterns: [
            {
              group: ["react/*", "react-dom/*", "firebase/*", "firebase-admin/*"],
              message: "packages/shared no puede importar React ni Firebase (doc 07 §2).",
            },
          ],
        },
      ],
    },
  },
]);

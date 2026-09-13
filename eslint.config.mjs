import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Config files sit outside the TypeScript project, so type-aware
    // rules have no program to resolve them against.
    files: ["**/*.mjs", "**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Scoped to the extensions eslint-config-next registers the
    // react-hooks plugin for. Naming a rule from a plugin that is not
    // registered for a file it matches aborts the entire run rather than
    // failing that one file, so unscoped this breaks the moment a .cjs
    // file lands in the repo.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      // React Compiler correctness rules that ship with
      // eslint-plugin-react-hooks but are off by default. Both are
      // meta.type "problem" rather than stylistic.
      "react-hooks/void-use-memo": "error",
      "react-hooks/no-deriving-state-in-effects": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

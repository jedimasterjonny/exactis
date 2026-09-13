import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  perfectionist.configs["recommended-natural"],
  eslintComments.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Config files sit outside the TypeScript project, so type-aware
  // rules have no program to resolve them against.
  {
    extends: [tseslint.configs.disableTypeChecked],
    files: ["**/*.mjs", "**/*.js"],
  },
  {
    // Suppressing a rule must be a deliberate, narrow, justified act.
    // no-unlimited-disable (from recommended) blocks bare
    // eslint-disable that switches off every rule at once; this
    // requires each suppression to state why. ESLint's own
    // reportUnusedDisableDirectives already covers stale directives,
    // so the plugin's no-unused-disable is left off as redundant.
    rules: { "@eslint-community/eslint-comments/require-description": "error" },
  },
  {
    // Type-only imports must say so, so they are erased at compile time
    // rather than left as a runtime import of a module needed only for
    // its types.
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          disallowTypeAnnotations: true,
          fixStyle: "separate-type-imports",
          prefer: "type-imports",
        },
      ],
    },
  },
  {
    // Exported functions must state their return type. Inference is fine
    // inside a module, but at a module boundary an accidental change to
    // the inferred type propagates silently to every caller.
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": [
        "error",
        {
          allowArgumentsExplicitlyTypedAsAny: false,
          allowDirectConstAssertionInArrowFunctions: true,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
    },
  },
  {
    // React Compiler correctness rules that ship with
    // eslint-plugin-react-hooks but are off by default. Both are
    // meta.type "problem" rather than stylistic.
    //
    // Scoped to the extensions eslint-config-next registers the
    // react-hooks plugin for. Naming a rule from a plugin that is not
    // registered for a file it matches aborts the entire run rather than
    // failing that one file, so unscoped this breaks the moment a .cjs
    // file lands in the repo.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react-hooks/no-deriving-state-in-effects": "error",
      "react-hooks/void-use-memo": "error",
    },
  },
  // Must stay last: switches off any stylistic rule Prettier owns.
  eslintConfigPrettier,
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

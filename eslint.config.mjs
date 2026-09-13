import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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

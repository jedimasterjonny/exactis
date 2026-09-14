import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import vitest from "@vitest/eslint-plugin";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import jestDom from "eslint-plugin-jest-dom";
import perfectionist from "eslint-plugin-perfectionist";
import testingLibrary from "eslint-plugin-testing-library";
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
  // Naming, following the upstream typescript-eslint examples. camelCase
  // by default, widened per selector where another convention is genuinely
  // conventional, and narrowed where a prefix carries meaning: booleans
  // read as assertions, type parameters start with T. In those two cases
  // the prefix is stripped before format is applied, which is why they
  // specify PascalCase - isEnabled is checked as Enabled. Booleans are
  // constrained at parameters and type properties too, not only at
  // variables, since those are the ones read at the call site.
  //
  // Anything unused must carry a leading underscore, so a dead binding is
  // visibly dead rather than merely tolerated.
  //
  // Scoped to the files tsconfig.json includes - .ts, .tsx and .mts -
  // because the boolean selector consults the type checker. The .mjs
  // and .js config files are the ones that sit outside the TypeScript
  // program; unscoped the rule reaches them and aborts the whole lint
  // run.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    rules: {
      "@typescript-eslint/naming-convention": [
        "error",
        {
          format: ["camelCase"],
          leadingUnderscore: "allow",
          selector: "default",
          trailingUnderscore: "forbid",
        },
        {
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
          selector: "variable",
        },
        // types: ["boolean"] outranks the requiresQuotes exemption below,
        // so quoted keys are filtered out here as well - otherwise a
        // data-* boolean prop would be told to start with a verb.
        {
          filter: { match: false, regex: "[^a-zA-Z0-9]" },
          format: ["PascalCase"],
          prefix: ["is", "should", "has", "can", "did", "will"],
          selector: ["variable", "parameter", "typeProperty"],
          types: ["boolean"],
        },
        { format: ["camelCase", "PascalCase"], selector: "function" },
        {
          format: ["camelCase"],
          leadingUnderscore: "allow",
          selector: "parameter",
        },
        {
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "require",
          modifiers: ["unused"],
          selector: ["variable", "parameter"],
        },
        { format: ["PascalCase"], selector: "typeLike" },
        {
          custom: { match: false, regex: "^I[A-Z]" },
          format: ["PascalCase"],
          selector: "interface",
        },
        { format: ["PascalCase"], prefix: ["T"], selector: "typeParameter" },
        { format: ["PascalCase"], selector: "enumMember" },
        { format: ["camelCase", "PascalCase"], selector: "import" },
        // Quoted keys are external shapes - HTTP headers, CSS custom
        // properties, data-* attributes - and are not ours to rename.
        {
          format: null,
          modifiers: ["requiresQuotes"],
          selector: [
            "accessor",
            "classMethod",
            "classProperty",
            "enumMember",
            "objectLiteralMethod",
            "objectLiteralProperty",
            "typeMethod",
            "typeProperty",
          ],
        },
      ],
    },
  },
  // Generated components are vendored, not authored: `shadcn add` writes
  // into src/components/ui and overwrites on update, and the prop names
  // there are the upstream API - asChild from Base UI, disabled from
  // React.ComponentProps<"button">. The boolean prefix asserts a
  // convention over names this repo picks, so it has nothing to say here.
  //
  // It has to be a separate block rather than an exemption inside the
  // option array above: entries are selected by descending weight, types
  // outranks every modifier, and the boolean entry already carries a
  // filter, so neither a destructured nor a filter entry can be reached
  // ahead of it.
  {
    files: ["src/components/ui/**"],
    rules: { "@typescript-eslint/naming-convention": "off" },
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
  // Test files carry their own rule sets. Several of these restate a
  // vitest.config.mts setting at lint time, on purpose: the config fails
  // the run, the rule fails the edit, and the second is the one that says
  // which line is wrong.
  {
    extends: [
      vitest.configs.recommended,
      testingLibrary.configs["flat/react"],
      jestDom.configs["flat/recommended"],
    ],
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      // it, never test, and never both in one file.
      "vitest/consistent-test-it": ["error", { fn: "it" }],
      // A test with no assertion passes. requireAssertions catches it at
      // run time; this catches it while it is being written.
      "vitest/expect-expect": "error",
      // A branch in a test means the test is not asserting one thing, and
      // an assertion inside one may never execute at all.
      "vitest/no-conditional-expect": "error",
      "vitest/no-conditional-in-test": "error",
      // The two ways to commit a suite that silently does not run.
      // AGENTS.md forbids both.
      "vitest/no-disabled-tests": "error",
      "vitest/no-focused-tests": ["error", { fixable: false }],
      // toEqual ignores undefined properties and class identity.
      "vitest/prefer-strict-equal": "error",
      // Every test sits in a describe, so a failure names the unit.
      "vitest/require-top-level-describe": "error",
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
    // Generated by vitest run --coverage.
    "coverage/**",
  ]),
]);

export default eslintConfig;

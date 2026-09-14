import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import react from "@eslint-react/eslint-plugin";
import json from "@eslint/json";
import vitest from "@vitest/eslint-plugin";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import jestDom from "eslint-plugin-jest-dom";
import jsxA11y from "eslint-plugin-jsx-a11y";
import packageJson from "eslint-plugin-package-json";
import perfectionist from "eslint-plugin-perfectionist";
import promise from "eslint-plugin-promise";
import regexp from "eslint-plugin-regexp";
import sonarjs from "eslint-plugin-sonarjs";
import testingLibrary from "eslint-plugin-testing-library";
import yml from "eslint-plugin-yml";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Every extension ESLint is handed here, named once. Its own defaults
// glob .js, .mjs and .cjs; eslint-config-next adds .jsx, .ts, .tsx, .mts
// and .cts. A block with no `files` applies to every file ESLint visits,
// which is indistinguishable from this list while the list is all there
// is, and wrong the moment a config block matches something else.
const codeFiles = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];

// The extensions that can never be in the TypeScript program. tsconfig.json
// includes .ts, .tsx, .mts and .cts, and no JavaScript extension can join
// them.
const untypedFiles = ["**/*.{js,jsx,mjs,cjs}"];

// The extensions tsconfig.json does include, and so the only ones a
// type-aware rule can be named for. A type-aware rule listed against a
// file with no program behind it fails that file at parse time, which is
// why these do not simply reuse codeFiles and lean on disableTypeChecked.
const typedFiles = ["**/*.{ts,tsx,mts,cts}"];

const eslintConfig = defineConfig([
  // Deliberately the one block with no `files`, because neither option
  // names a rule, a plugin or a parser: an `eslint-disable` that no longer
  // suppresses anything is stale in a YAML file exactly as it is in a
  // TypeScript one.
  //
  // reportUnusedInlineConfigs is the larger of the two gains: ESLint
  // leaves it off entirely, so an inline `/* eslint rule: "error" */` that
  // only restates what this file already says was invisible until now.
  //
  // reportUnusedDisableDirectives is already "warn" by default (ESLint's
  // own default-config.js), so a stale directive currently fails only
  // because `lint` passes --max-warnings 0. At "error" the failure belongs
  // to the config rather than to a CLI flag: a bare `eslint` exits 1
  // instead of 0, which is what an editor and every invocation without
  // that flag actually see.
  //
  // What the severity does not buy is protection from `lint:fix`, which
  // deletes a stale directive rather than reporting it, and does so at
  // either severity. The `-- reason` recording why a rule was ever
  // suppressed goes with it, so `lint:fix` is the wrong command to reach
  // for when this one fires.
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
  },
  { extends: [nextVitals, nextTs], files: codeFiles },
  {
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      perfectionist.configs["recommended-natural"],
      eslintComments.recommended,
    ],
    files: codeFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Three plugins that each cover a class of bug the TypeScript rules
  // cannot see. promise catches a floating or mis-nested then/catch;
  // regexp catches a pattern that is wrong rather than merely ugly - a
  // character class that can never match, a quantifier that backtracks
  // catastrophically; sonarjs covers duplicated branches, unreachable
  // conditions and the cognitive-complexity ceiling.
  {
    extends: [
      promise.configs["flat/recommended"],
      regexp.configs["flat/recommended"],
      sonarjs.configs.recommended,
    ],
    files: codeFiles,
  },
  // sonarjs/argument-type cannot instantiate a type parameter under the
  // TypeScript 6 API, so it reads every generic signature as unresolved:
  // `[1, 2].indexOf(1)` reports `expected 'T' instead of 'number'`. It is
  // not reacting to anything this repo wrote, which is why it is off
  // everywhere rather than narrowed the way the exemptions below are -
  // scoping it to the one file that trips it today would only move the
  // error to whichever file next calls a generic method.
  //
  // sonarjs depends on `typescript: ">=5 <6.1.0"`, so 6.0 is inside the
  // range it claims, and this is a bug rather than a version reached past.
  // 4.2.0 is current and still carries it. The rule goes back on when a
  // release fixes it; nothing else in recommended is affected.
  { files: codeFiles, rules: { "sonarjs/argument-type": "off" } },
  // eslint-config-next ships eslint-plugin-react's recommended set, which
  // predates hooks and function components. @eslint-react is the modern
  // equivalent and reports under its own namespace, so it adds to that set
  // rather than colliding with it.
  {
    extends: [react.configs["recommended-typescript"]],
    files: ["**/*.{ts,tsx}"],
  },
  // jsx-a11y, in full. next/core-web-vitals enables six of these rules;
  // strict enables thirty-one, and switches none of the six off, so this
  // is a pure gain of twenty-five - keyboard handlers to match mouse
  // handlers, labels tied to controls, valid ARIA roles.
  //
  // Spread as bare rules rather than as the config, because
  // eslint-config-next has already registered the jsx-a11y plugin and a
  // second registration is `ConfigError: Key "plugins": Cannot redefine
  // plugin "jsx-a11y"`, which takes down the whole run.
  { files: ["**/*.tsx"], rules: jsxA11y.flatConfigs.strict.rules },
  // Tailwind class names, checked against the stylesheet. The Prettier
  // plugin sorts a class list and drops duplicates but validates nothing,
  // so `text-cetner` ships as a class no rule matches and the element
  // renders unstyled without a word. no-unknown-classes resolves every
  // class through Tailwind itself, from the same entry point the Prettier
  // plugin reads, so the theme tokens in globals.css and the tw-animate-css
  // utilities are known and a typo is not. no-conflicting-classes reports
  // two utilities setting the same property, where the winner is decided
  // by stylesheet order rather than by the order written.
  // no-concatenated-classes rejects a class assembled from string pieces,
  // which Tailwind cannot see at build time any more than this rule can.
  //
  // The stylistic set is deliberately absent. Class order, whitespace,
  // duplicates and line wrapping belong to Prettier, and a second opinion
  // on them can only agree or fight.
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwindcss },
    rules: {
      "better-tailwindcss/no-concatenated-classes": "error",
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-unknown-classes": "error",
    },
    settings: { "better-tailwindcss": { entryPoint: "src/app/globals.css" } },
  },
  // Config files sit outside the TypeScript project, so type-aware
  // rules have no program to resolve them against. The whole JavaScript
  // family, not just the two extensions that happen to exist today: a
  // .cjs or .jsx file inherits the TypeScript parser from
  // typescript-eslint/base and fails to parse at all, because tsconfig.json
  // will never include it. .cts is not here because it is TypeScript and
  // tsconfig.json now includes it, so it has a program like any other
  // TypeScript extension.
  { extends: [tseslint.configs.disableTypeChecked], files: untypedFiles },
  // Suppressing a rule must be a deliberate, narrow, justified act.
  // no-unlimited-disable (from recommended) blocks bare eslint-disable
  // that switches off every rule at once; this requires each suppression
  // to state why. ESLint's own reportUnusedDisableDirectives already
  // covers stale directives, so the plugin's no-unused-disable is left
  // off as redundant.
  {
    files: codeFiles,
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
  // Scoped to the files tsconfig.json includes - .ts, .tsx, .mts and
  // .cts - because the boolean selector consults the type checker. The
  // .mjs and .js config files are the ones that sit outside the
  // TypeScript program; unscoped the rule reaches them and aborts the
  // whole lint run.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
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
    files: codeFiles,
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
  // Every function states its return type, not only the exported ones.
  // explicit-function-return-type supersedes
  // explicit-module-boundary-types, which is removed here rather than kept
  // alongside it: both would report the same missing annotation on an
  // exported function, and the narrower rule has nothing left to say once
  // the wider one is on.
  //
  // The reason to widen is that the module boundary is not where the type
  // is decided. A helper whose inferred return type drifts changes the
  // exported function that returns it, and the annotation that would have
  // caught it is the one on the helper.
  //
  // allowTypedFunctionExpressions, on by default and stated here because
  // it is what keeps this liveable, exempts a function expression that
  // already has a type from its context: an onChange={(e) => ...} takes
  // its signature from the JSX prop, and a .map(...) callback from the
  // array, so neither is asked to repeat it.
  {
    files: codeFiles,
    rules: {
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowDirectConstAssertionInArrowFunctions: true,
          allowExpressions: false,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
    },
  },
  // The rest of the non-deprecated typescript-eslint set, scoped to the
  // extensions tsconfig.json includes because most of these consult the
  // type checker and all of them are about TypeScript rather than about
  // the .mjs config files.
  {
    files: typedFiles,
    rules: {
      // The class and enum rules are insurance: this codebase has neither
      // yet, and enabling them now means the first class written here is
      // written the way the rest of the config implies, rather than the
      // rules arriving afterwards as a reformatting commit. They cost
      // nothing until then.
      "@typescript-eslint/class-methods-use-this": "error",
      // `export type` on a type-only export, so it erases.
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/default-param-last": "error",
      "@typescript-eslint/explicit-member-accessibility": "error",
      "@typescript-eslint/max-params": "error",
      "@typescript-eslint/member-ordering": "error",
      // A method declared as a method is bivariant in its parameters and a
      // property holding a function is not, so `property` is the form that
      // actually type checks what is passed to it.
      "@typescript-eslint/method-signature-style": ["error", "property"],
      "@typescript-eslint/no-dupe-class-members": "error",
      // `import type` must not be the thing that pulls a module in for its
      // side effects.
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-invalid-this": "error",
      "@typescript-eslint/no-unnecessary-qualifier": "error",
      // The assertion strictTypeChecked does not cover, and the most
      // valuable rule here. `as` onto a type the value is not already
      // assignable to is the last way to lie to the compiler without
      // writing `any`, and `(await response.json()) as ApiPayload` is how
      // it usually happens: json() returns any, the assertion invents a
      // shape, and nothing ever checks it.
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      // functions: false, and it must be. At the default of true this rule
      // and perfectionist/sort-modules are mutually unsatisfiable on any
      // file with a helper below an export: sort-modules requires the
      // exported function first, and no-use-before-define then reports the
      // helper it calls. Verified in both directions. A hoisted function
      // declaration has no temporal dead zone so exempting it costs no
      // safety, and a `const` used above its declaration still reports.
      "@typescript-eslint/no-use-before-define": [
        "error",
        { functions: false },
      ],
      // An `export {}` that is no longer what makes the file a module.
      "@typescript-eslint/no-useless-empty-export": "error",
      "@typescript-eslint/parameter-properties": "error",
      "@typescript-eslint/prefer-enum-initializers": "error",
      // A private field never reassigned outside the constructor should
      // say readonly.
      "@typescript-eslint/prefer-readonly": "error",
      // A function returning a promise should say so in its signature
      // rather than only in its body.
      "@typescript-eslint/promise-function-async": "error",
      // [10, 9, 1].sort() sorts lexicographically and yields [1, 10, 9].
      "@typescript-eslint/require-array-sort-compare": "error",
      // `{items.length && <Row/>}` renders a literal 0 when the list is
      // empty, because && evaluates to the number rather than to a
      // boolean. That single defect is the whole reason for
      // allowNumber: false.
      //
      // allowString is deliberately left at its default of true. The
      // empty-string case has no equivalent React footgun - "" renders as
      // nothing - so turning it off would buy a `str !== ""` at every
      // guard and prevent no defect.
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        { allowNumber: false },
      ],
      // Passing an async function where a void-returning one is expected
      // discards the promise: a rejection becomes an unhandled one and the
      // await never happens. Event handlers and useEffect callbacks are
      // the usual victims.
      "@typescript-eslint/strict-void-return": "error",
      // A switch over a union must handle every member, and a `default` is
      // not accepted as handling them - a default is precisely what stops
      // the compiler reporting a member added later. On a non-union
      // switch, where exhaustiveness cannot be checked at all, one is
      // required instead.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        {
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
      // Core rule: typescript-eslint ships no extension of it.
      "no-unused-private-class-members": "error",
    },
  },
  // vitest.setup.ts installs the console guard, and reaches console
  // through `console as unknown as Record<GuardedMethod, Recorder>` because
  // console's methods have mutually incompatible signatures and the guard
  // treats them alike. That double assertion is exactly the shape
  // no-unsafe-type-assertion exists to find, and here it is deliberate,
  // commented, and the point of the file. Narrowed to the one file rather
  // than weakened everywhere.
  {
    files: ["vitest.setup.ts"],
    rules: { "@typescript-eslint/no-unsafe-type-assertion": "off" },
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
  // JSON. renovate.json, components.json and .prettierrc.json were being
  // checked by nothing at all until now - a duplicate key or a stray
  // trailing comma in any of them was a runtime surprise in whatever tool
  // reads it.
  //
  // package.json is excluded rather than merely ordered before its own
  // block. eslint-plugin-package-json parses through
  // languageOptions.parser (jsonc-eslint-parser) instead of declaring a
  // language, so a block setting language: "json/json" on the same file
  // wins the language slot, the plugin's rules are handed an AST they do
  // not recognise, and all fifty-eight of them match nothing and report
  // nothing. It fails open, silently, which is the trap.
  {
    extends: [json.configs.recommended],
    files: ["**/*.json"],
    ignores: ["**/package.json", "**/tsconfig.json"],
    language: "json/json",
  },
  // tsconfig.json is read as JSON with Comments by TypeScript itself, and
  // every other config file in this repo carries comments explaining
  // itself. Parsing it as strict JSON would make adding one a lint
  // failure, so it is the one file linted as jsonc.
  {
    extends: [json.configs.recommended],
    files: ["**/tsconfig.json"],
    language: "json/jsonc",
  },
  // package.json, which is the one JSON file here with semantics worth
  // checking: duplicate dependencies, a dependency listed in two groups,
  // a malformed version range.
  //
  // sort-collections is narrowed to the dependency groups. Its default
  // also sorts `scripts`, which are ordered by lifecycle here - dev,
  // build, start, then the checks - and that reads better than
  // alphabetical. require-description and require-type are off: both
  // demand new fields in package.json, and this commit adds linting
  // rather than changing what is being linted. `type` in particular
  // decides how every .js file in the repo is interpreted, which is a
  // decision that deserves its own commit rather than arriving as a side
  // effect of one about ESLint.
  {
    extends: [packageJson.configs.recommended],
    files: ["**/package.json"],
    rules: {
      "package-json/require-description": "off",
      "package-json/require-type": "off",
      "package-json/sort-collections": [
        "error",
        ["dependencies", "devDependencies"],
      ],
    },
  },
  // YAML, which today means .github/workflows/ci.yml - the file that
  // decides whether anything else here is checked at all, and the only
  // one that was not itself checked. flat/prettier last, for the same
  // reason eslintConfigPrettier is last below.
  {
    extends: [yml.configs["flat/standard"], yml.configs["flat/prettier"]],
    files: ["**/*.{yaml,yml}"],
  },
  // `on: pull_request:` with no value is how a workflow subscribes to an
  // event's default activity types. It is the idiomatic spelling, GitHub
  // documents it, and no-empty-mapping-value reports every one of them.
  {
    files: [".github/workflows/*.{yaml,yml}"],
    rules: { "yml/no-empty-mapping-value": "off" },
  },
  // Must stay last: switches off any stylistic rule Prettier owns.
  { extends: [eslintConfigPrettier], files: codeFiles },
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

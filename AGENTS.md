<!-- prettier-ignore-start -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- prettier-ignore-end -->

# Working agreements

This file is the source of truth for how work is done here. It is checked in, so
it travels between machines; agent memory does not. Never let a convention that
matters live only in memory — put it here.

- Propose the commit split before starting work that spans more than one
  decision.
- History is audited after the fact. Expect to be asked to confirm minimum diff
  surface and true atomicity.
- "Accepted" on a review finding means acknowledged and closed. It is not an
  instruction to go and fix it.
- Work lands by pull request, merged by rebase once both CI jobs are green.
  Merge and squash commits are disabled in the repository settings. Branch
  protection is deliberately not used, so CI is the gate and the discipline is
  the lock.
- Node is pinned by `.node-version` to 26.8.2, and that file is the only place
  the version is written: both CI jobs read it through `node-version-file`
  rather than naming one, and Renovate's nodenv manager updates it there.
  `engines.node` is a separate statement — the range the package supports,
  `^22.22.2 || ^24.15.0 || >=26.0.0` — and `constraintsFiltering: "strict"` in
  `renovate.json` holds Renovate to it, so an upgrade that would need a newer
  Node than the floor is never proposed.

# Code style

Beyond `strict`, `tsconfig.json` sets `noUncheckedIndexedAccess` (indexing
yields `T | undefined`), `exactOptionalPropertyTypes` (an optional property will
not accept an explicit `undefined`), `noPropertyAccessFromIndexSignature`
(bracket access, not dot), `erasableSyntaxOnly` (no enum, namespace, parameter
properties or `import =`), `moduleDetection: "force"`, `allowJs: false`,
`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`,
`noImplicitReturns`, `noFallthroughCasesInSwitch` and `noImplicitOverride`.
`lib` is pinned to ES2022 rather than esnext, so an API newer than that is a
type error rather than a runtime one.

ESLint runs `strictTypeChecked` and `stylisticTypeChecked` at
`--max-warnings 0`. The rules most often tripped over:

- Type-only imports must be written `import type`, on their own line.
- Every function needs an explicit return type, not only exported ones.
  Contextually typed callbacks are exempt.
- A type assertion from `any` or `unknown` is rejected. Parse or narrow instead.
- A `switch` over a union must be exhaustive.
- A number in a boolean position is an error, because `{items.length && <x/>}`
  renders a literal `0`.
- perfectionist sorts imports and object keys naturally. Write them sorted.
- Booleans are prefixed `is`, `should`, `has`, `can`, `did` or `will`; type
  parameters start with `T`; unused bindings need a leading underscore.
- Every `eslint-disable` needs a `-- reason` description.
- Tailwind class names are resolved against `src/app/globals.css`. An unknown
  class, two classes setting the same property, and a class built from string
  pieces are errors.

JSON and YAML are linted too, so `package.json`, `renovate.json` and the
workflow are not exempt. knip fails on an unused dependency, export or file.

The three `.mjs` config files - ESLint, commitlint and PostCSS - stay outside
the TypeScript program on purpose. ESLint 10 loads a `.ts` config only through
jiti or its `unstable_native_nodejs_ts_config` flag, and either is a moving part
on every invocation, the editor's included, bought for a file whose keys and
rule options ESLint already validates at load.

`bunfig.toml` sets `linker = "isolated"`, so `node_modules` is not hoisted and
each package sees only what it declares. Importing a transitive dependency fails
with `ERR_MODULE_NOT_FOUND` rather than quietly working — `scheduler` is
installed for `react-dom` and does not resolve from here — which is the intended
behaviour, not a broken install. The fix is to declare the package in
`package.json` in its own right, never to reach through whatever pulled it in.

Prettier owns formatting. Run `bun run format` rather than hand-aligning
anything.

Tests run on Vitest with jsdom and Testing Library, colocated as
`*.test.ts`/`*.test.tsx`. `globals` is off, so `describe`, `it` and `expect` are
imported. A test that asserts nothing fails, and test order is shuffled.

`vitest.setup.ts` installs a console guard that fails the test which produced
unexpected output, and it reaches further than `error` and `warn`. Fourteen
methods are guarded — `log`, `debug`, `info`, `dir`, `trace`, `table` and the
rest of the ones that emit on their own — and the guard stands in for the real
console, so a `console.log` left in while debugging prints nothing and fails the
test that ran it. Output from module scope, from a `beforeAll`, or from anything
resolving after the file has finished is caught as well.

The guard may not be switched off, and each obvious attempt is detected and
reported as tampering: reassigning `console.error`, restoring the spy, and
calling `mockImplementation` on it. Asserting on console output goes through
`takeConsoleOutput()`, exported from `vitest.setup.ts`, which is the only
sanctioned route. It returns `string[]` — one `console.<method>: <message>` line
per call, worded as the guard would have reported it — takes only the running
test's own output, and clears what it takes so that asserting on it does not
also fail the test. Called outside a test, it throws.

`vitest.setup.test.ts` holds the guard to all of this. A test that is meant to
go red cannot assert on its own redness, so it writes fixture suites to a
temporary directory, runs them under a child Vitest loading the same setup file,
and reads the child's report.

# Commit hygiene

Conventional Commits. Scope names the config surface touched (`ts`, `lint`,
`hooks`) and is omitted for repo-wide changes or a new standalone tool.
commitlint checks the type, the subject and the header length; the scope
convention is not machine-enforced.

- One decision per commit. Split scaffolding from the deliberate change layered
  on top.
- Minimum diff surface. Formatter sweeps, drive-by renames and unrelated tidying
  get their own commit or do not happen.
- Every commit stands alone. Regenerate `bun.lock` per commit, and check a
  series with a throwaway worktree: `git worktree add`, then
  `bun install --frozen-lockfile && bun run typecheck` at each commit.
- Drop verification artefacts before the work lands: smoke-test files, scratch
  scripts, probe commits. Never fold them into a real commit.
- The body says what was decided, what was rejected and why, and what was
  verified. Not a restatement of the diff.
- Fix a wrong commit by amending or rebasing it, not with a follow-up `fix:`.
  Ask first before rewriting a commit you did not create in this session.

## Never commit red

The pre-commit hook already blocks unformatted, unlinted and mistyped code, and
a failing or uncovered test suite, so what matters here is what the hook cannot
reach:

- IMPORTANT: never use `--no-verify`. CI runs the same checks on every push and
  pull request, so bypassing the hook defers the failure rather than avoiding
  it.
- `git rebase` does not re-run the hook. After reordering or amending, every
  commit in the series must still be green, not only the tip.
- Never suppress a diagnostic to clear a check, and never delete, skip or
  `.only` a test or loosen an assertion to match behaviour that is broken. A
  skipped test reports nothing, which is worse than red.
- Coverage is 100% per file. Reaching it by widening `coverage.exclude` is the
  same act as deleting a test.

# Skills

Knowledge that applies only sometimes lives in `.claude/skills/`, loaded when
the task calls for it rather than every session:

- `lint-stack-upgrade`, for bumping ESLint or TypeScript or enabling a further
  `react/` or `import/` rule. The short version: peer ranges are enforced by
  nothing here, and TypeScript 7 cannot lint here at all.

# Next config traps

This Next version removes and renames more than its own docs admit, and several
of the traps are silent. Verified against the installed package, not from
memory.

- `experimental.ppr` still has a deprecated type and still passes the config
  schema, so a TypeScript config compiles clean and then `next build`
  hard-throws. It merged into `cacheComponents`. This is the likeliest trap
  here, because nothing catches it before runtime.
- `devIndicators.buildActivity` and its siblings are stripped with no warning at
  all: that schema object is non-strict, so unknown sub-keys vanish rather than
  being reported.
- An unknown top-level key warns but does not fail, so a typo survives a build.
- The `eslint` key was removed in 16. In a typed config it is a `TS2353` and the
  build exits 1.
- `middleware.ts` is now `proxy.ts`, and the named export `middleware` is now
  `proxy`. There is no edge runtime for it.
- Never set `typescript.ignoreBuildErrors`, and never set
  `experimental.useTypeScriptCli: false`. The legacy in-process checker discards
  diagnostics in files matching `spec`/`test`/`__tests__`, so type errors in
  tests disappear from `next build` entirely.

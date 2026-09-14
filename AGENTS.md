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

JSON and YAML are linted too, so `package.json`, `renovate.json` and the
workflow are not exempt. knip fails on an unused dependency, export or file.

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

# Lint stack version traps

Peer ranges are enforced by nothing here. Bun installs a plugin whose declared
range excludes the ESLint alongside it without a word, and CI never looks, so a
major that goes green on the first run has proved less than it appears to: only
that nothing threw on the files this repo happens to contain.

ESLint is on 10 and three plugins do not declare it. `eslint-plugin-jsx-a11y`
allows up to `^9`, `eslint-plugin-react` up to `^9.7`, `eslint-plugin-import` up
to `^9`. The last two arrive through `eslint-config-next`, which declares
`>=9.0.0` and is not itself the problem — the obvious suspect is the wrong one.

That is safe today for a narrow reason worth keeping written down.
`eslint-plugin-jsx-a11y` makes no live use of anything 10 removed, so its
ceiling is only a stale range. The other two do use them —
`context.getSourceCode()`, `context.getFilename()`, `context.parserOptions`,
`context.parserPath`, `isSpaceBetweenTokens`, `getJSDocComment`,
`getTokenOrCommentBefore` and `getTokenOrCommentAfter` — across thirty-one call
sites, none of which fall in the eighteen rules of theirs this config enables.
They sit in the stylistic rules `eslint-config-prettier` switches off and in
rules Next does not turn on.

The exposure is therefore latent rather than absent. Enabling a further `react/`
or `import/` rule is what reaches a removed API, and it fails when that rule
runs on code taking that path — not at install, not at config load, and not
necessarily on the four source files here. Read the rule's source for those
names before switching one on.

Two checks are worth repeating after any ESLint major, because neither the
install nor the suite performs them. Diff `eslint --print-config` against a
source file before and after, where the count of active rules must not move: a
plugin contributing nothing looks exactly like a plugin with nothing to report.
Then provoke rules from each plugin with a throwaway file, to show they still
report rather than merely being listed.

TypeScript is held at 6 by a ceiling of the same kind. `typescript-eslint` and
`eslint-plugin-sonarjs` both cap at `<6.1.0`, and 7.0 ships no JavaScript
compiler API for either to build on, so 7 cannot lint here at all. The Renovate
PR proposing it is left open, red, and commented with the detail rather than
closed, so the question is not reopened from scratch each time.

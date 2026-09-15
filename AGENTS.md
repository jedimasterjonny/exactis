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
matters live only in memory — put it here, or in a skill under `.claude/skills/`
when it applies only sometimes.

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
- Node is pinned in `.node-version`, the only place the version is written.
  `engines.node` is a separate statement, the range the package supports, and
  Renovate is held to it.

# Code style

`tsconfig.json` is strict well beyond `strict`. Read it before assuming a
default. `lib` is ES2022, so an API newer than that is a type error rather than
a runtime one.

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

The `.mjs` config files stay outside the TypeScript program. ESLint loads a
`.ts` config only through jiti or an unstable flag, and neither is worth a
moving part on every invocation.

`node_modules` is not hoisted (`linker = "isolated"` in `bunfig.toml`), so an
import of a transitive dependency fails with `ERR_MODULE_NOT_FOUND` by design.
Declare the package in `package.json`; never reach through whatever pulled it
in.

Prettier owns formatting. Run `bun run format` rather than hand-aligning
anything.

Tests run on Vitest with jsdom and Testing Library, colocated as
`*.test.ts`/`*.test.tsx`. `globals` is off, so `describe`, `it` and `expect` are
imported. A test that asserts nothing fails, and test order is shuffled.

- Console output during a test fails that test, on every method that emits and
  wherever in the file it comes from. A `console.log` left in prints nothing and
  goes red.
- Do not silence the guard. Reassigning, restoring or re-mocking a console
  method is detected and reported as tampering.
- To assert on console output, call `takeConsoleOutput()` from
  `vitest.setup.ts`. It returns the running test's lines and clears them.

# Commit hygiene

Conventional Commits, and every commit carries a scope. A bare `type:` header
does not appear in this history and should not be the first.

The scope names the surface touched, not the reason for the change: `ts`,
`lint`, `hooks`, `format`, `deps`, `workflow` for the config files, `ui`,
`theme`, `accounts`, `auth`, `projection` for the app. The vocabulary is
open-ended and grows with the codebase, so a commit touching a surface none of
the existing names cover brings a new one. What it must not do is give a surface
a second spelling, because then neither name finds the whole story. Read the
vocabulary back off the history before inventing a name.

The type states the kind of change, and it is read against the diff rather than
against the subject. A `docs:` commit that edits source, a `style:` one that
changes behaviour, a `feat:` one that only moves code: each took its type from
what the commit was about rather than from what it did, and each is usually a
commit that should have been two.

commitlint checks the type, the subject, the body and the header length, and
rejects an upper-case scope. That a scope is there at all, and that the type and
the scope are the right ones, is not machine-enforced.

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

- `shadcn-add`, for adding or updating a shadcn component. The short version:
  files under `src/components/ui` are owned source held to every gate, and a
  dependency lands with the first file that imports it.
- `lint-stack-upgrade`, for bumping ESLint or TypeScript or enabling a further
  `react/` or `import/` rule. The short version: peer ranges are enforced by
  nothing here, and TypeScript 7 cannot lint here at all.

# Next config traps

Verified against the installed package, not from memory. Several are silent:

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

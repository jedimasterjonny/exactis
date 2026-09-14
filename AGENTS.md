<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working agreements

This file is the source of truth for how work is done here. It is checked in, so it travels between machines; agent memory does not. Never let a convention that matters live only in memory — put it here.

- Propose the commit split before starting work that spans more than one decision.
- History is audited after the fact. Expect to be asked to confirm minimum diff surface and true atomicity.
- "Accepted" on a review finding means acknowledged and closed. It is not an instruction to go and fix it.

# Code style

Beyond `strict`, `tsconfig.json` sets `noUncheckedIndexedAccess` (indexing yields `T | undefined`), `exactOptionalPropertyTypes` (an optional property will not accept an explicit `undefined`), `verbatimModuleSyntax`, `noImplicitReturns`, `noFallthroughCasesInSwitch` and `noImplicitOverride`.

ESLint runs `strictTypeChecked` and `stylisticTypeChecked` at `--max-warnings 0`. The rules most often tripped over:

- Type-only imports must be written `import type`, on their own line.
- Exported functions need an explicit return type.
- perfectionist sorts imports and object keys naturally. Write them sorted.
- Booleans are prefixed `is`, `should`, `has`, `can`, `did` or `will`; type parameters start with `T`; unused bindings need a leading underscore.
- Every `eslint-disable` needs a `-- reason` description.

Prettier owns formatting. Run `bun run format` rather than hand-aligning anything.

Tests run on Vitest with jsdom and Testing Library, colocated as `*.test.ts`/`*.test.tsx`. `globals` is off, so `describe`, `it` and `expect` are imported. A test that asserts nothing fails, test order is shuffled, and unexpected `console.error`/`console.warn` output fails the test that produced it.

# Commit hygiene

Conventional Commits. Scope names the config surface touched (`ts`, `lint`, `hooks`) and is omitted for repo-wide changes or a new standalone tool. commitlint checks the type, the subject and the header length; the scope convention is not machine-enforced.

- One decision per commit. Split scaffolding from the deliberate change layered on top.
- Minimum diff surface. Formatter sweeps, drive-by renames and unrelated tidying get their own commit or do not happen.
- Every commit stands alone. Regenerate `bun.lock` per commit, and check a series with a throwaway worktree: `git worktree add`, then `bun install --frozen-lockfile && bun run typecheck` at each commit.
- Drop verification artefacts before the work lands: smoke-test files, scratch scripts, probe commits. Never fold them into a real commit.
- The body says what was decided, what was rejected and why, and what was verified. Not a restatement of the diff.
- Fix a wrong commit by amending or rebasing it, not with a follow-up `fix:`. Ask first before rewriting a commit you did not create in this session.

## Never commit red

The pre-commit hook already blocks unformatted, unlinted and mistyped code, and a failing or uncovered test suite, so what matters here is what the hook cannot reach:

- IMPORTANT: never use `--no-verify`. CI runs the same checks on every push and pull request, so bypassing the hook defers the failure rather than avoiding it.
- `git rebase` does not re-run the hook. After reordering or amending, every commit in the series must still be green, not only the tip.
- Never suppress a diagnostic to clear a check, and never delete, skip or `.only` a test or loosen an assertion to match behaviour that is broken. A skipped test reports nothing, which is worse than red.
- Coverage is 100% per file. Reaching it by widening `coverage.exclude` is the same act as deleting a test.

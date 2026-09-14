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

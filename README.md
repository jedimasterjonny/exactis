# exactis

A Next.js skeleton: React 19, Tailwind CSS, and shadcn/ui over Base UI.

## Getting started

Bun is the only prerequisite, at the version `packageManager` in `package.json`
pins; install it from <https://bun.sh>. Then:

```bash
bun install --frozen-lockfile
bun dev
```

The app is then at <http://localhost:3000>, rendered from `src/app/page.tsx`.

## Scripts

| Script                                | Does                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `dev`                                 | Development server                                                |
| `build`, `start`                      | Production build, then serve it                                   |
| `lint`, `lint:fix`                    | ESLint at `--max-warnings 0`, without and with autofix            |
| `format`, `format:check`              | Prettier, rewriting and reporting                                 |
| `typecheck`                           | `next typegen`, then `tsc --noEmit`                               |
| `test`, `test:watch`, `test:coverage` | Vitest; coverage enforces the per-file 100% gate                  |
| `db:generate`, `db:migrate`           | Write a migration from the schema, then apply the pending ones    |
| `mcp:next`, `mcp:shadcn`              | The Next devtools and shadcn MCP servers, launched by `.mcp.json` |

## The store

Accounts live in Postgres, reached through [Drizzle](https://orm.drizzle.team)
over Neon's HTTP driver. The schema is `src/db/schema.ts`, the migrations
generated from it are in `drizzle/`, and the queries are in
`src/db/accounts.ts`.

`DATABASE_URL` names the database, as `.env.example` shows. Nothing reads it
until a query runs, so a build needs no database. Locally, point it at a Neon
branch of your own and apply the migrations once:

```bash
bun run db:migrate
```

A schema change is a new migration, written with `db:generate` and committed
with the change. The tests apply every migration to an in-process Postgres
([PGlite](https://pglite.dev)), so a migration that does not apply fails the
suite before it reaches a database.

[AGENTS.md](AGENTS.md) is the source of truth for how work is done here: code
style, commit rules, and what has to be green before anything lands.

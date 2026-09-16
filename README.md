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
| `hash-password`                       | Hash the password piped in, for `APP_PASSWORD_HASH`               |
| `mcp:next`, `mcp:shadcn`              | The Next devtools and shadcn MCP servers, launched by `.mcp.json` |

## The store

Accounts and income lines live in Postgres, reached through
[Drizzle](https://orm.drizzle.team) over Neon's HTTP driver. The schema is
`src/db/schema.ts`, the migrations generated from it are in `drizzle/`, and the
queries are in `src/db/accounts.ts` and `src/db/income.ts`.

The accounts screen reads and writes it, and the dashboard projects what it
holds; the progress screen still shows the reference kit's figures.
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

## The projection

The engine is `src/engine/projection.ts`: a pure function over the accounts and
a plan, giving a point per year to the plan's horizon. So far it carries the two
wrappers, tax-free and tax-deferred, each paid into as its accounts say and
grown at a plan rate held as a constant until there is an assumptions screen to
set it on. The dashboard reads it through `src/app/(app)/store.ts`, a cached
read keyed on the accounts, so a save on the accounts screen is a new projection
on the next render.

## Signing in

One user, one password. The app holds a hash of it in `APP_PASSWORD_HASH` and
seals the session into a cookie with `SESSION_PASSWORD`; there is no user table
and no third party. `.env.example` describes both. To set the password without
it showing on the terminal:

```bash
read -rs PASSWORD && printf %s "$PASSWORD" | bun run hash-password
```

Every route but `/login` sends anyone without a session there, from the proxy,
and every screen and server action that reads the store checks the session again
for itself. Sign out is at the foot of the sidebar; it ends the session and
returns to `/login`.

For development, `APP_DEV_SIGN_IN=1` in `.env.local` adds a second button to the
login screen that starts a session with no password asked, so an agent that
types no credentials can drive the app. It is read only outside a production
build, so it does nothing on Vercel, and the action behind it refuses a post at
a closed door rather than reporting a miss.

## Deploying

The app is built for Vercel with Neon behind it. Adding Neon from the Vercel
Marketplace sets `DATABASE_URL` on the project; `SESSION_PASSWORD` and
`APP_PASSWORD_HASH` are set by hand, as `.env.example` describes. A build needs
none of the three. The migrations are applied from a terminal with the
production URL in `DATABASE_URL`, before the first deploy that reads the store
and after any deploy that adds a migration:

```bash
bun run db:migrate
```

[AGENTS.md](AGENTS.md) is the source of truth for how work is done here: code
style, commit rules, and what has to be green before anything lands.

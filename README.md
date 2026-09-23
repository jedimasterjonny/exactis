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

Node is pinned in `.node-version`, which CI and Vercel read. Bun runs every
script here, so a local Node is not a prerequisite, but a `node` on `PATH` that
is not the pinned one is a difference between your machine and theirs. With nvm,
this closes it:

```bash
source scripts/use-node.sh
```

It installs the pinned version if it is missing, points nvm's `default` alias at
it, and switches the current shell. Sourced rather than run, because nvm is a
shell function and an executed script cannot move the shell that started it; as
`bash scripts/use-node.sh` it still installs and sets the default, and says the
shell was left alone. nvm reads `.nvmrc` and not `.node-version`, and the
version is written in one place only, so the script hands it to nvm rather than
a second file repeating it.

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

Accounts, income lines and expense lines live in Postgres, reached through
[Drizzle](https://orm.drizzle.team) over Neon's HTTP driver. The schema is
`src/db/schema.ts`, the migrations generated from it are in `drizzle/`, and the
queries are in `src/db/accounts.ts`, `src/db/income.ts` and
`src/db/expenses.ts`.

The accounts and plan screens read and write it, and the dashboard projects what
it holds; the progress screen still shows the reference kit's figures.
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

The engine is `src/engine/projection.ts`: a pure function over the accounts, the
income and expense lines and a plan, giving a point per year to the plan's
horizon, each the balance entering that year. So far it plots the two wrappers,
tax-free and tax-deferred, each paid into a month at a time as its accounts say
and grown at a plan rate held as a constant until there is an assumptions screen
to set it on. Cash is carried beside them, so a short month can be drawn from
it, but it is not plotted, since the progress points a projection is laid over
carry no cash figure. The first year runs from the month the plan is read in,
since the balances are that month's. What an account is paid in a month is what
`src/engine/cash-flow.ts` works out: the month's income, less what the salaries
sacrifice, the tax on the rest and what the expense lines cost, pays the fixed
sums, handed down the accounts in the order they are listed, and what survives
them is the spare money, handed down the accounts that take it the same way,
each to a twelfth of its cap. A fixed sum is therefore paid only out of what the
month has, so a contribution stops when the income funding it ends.

The income is taxed as the UK outside Scotland taxes it for 2026/27, the rates
held in `src/lib/tax.ts`: income tax on every kind of line, with the personal
allowance withdrawn over £100,000, Class 1 National Insurance on a salary and
Class 4 on self-employed profit, and none on a pension or other income. A
sacrifice comes off the salary before either, so what it saves in tax is what it
saves the month. A fixed sum or the spare money paid into a pension comes out of
taxed money instead, so the pension claims the basic rate back on it and £800
paid lands as £1,000, which is what a pension's cap is held to; the relief a
higher rate taxpayer claims on top is theirs rather than the pension's, and is
not counted. Each month is taxed as a twelfth of a year, which is the year's tax
exactly when its months are alike and too much or too little when they are not,
as in the year a salary stops. So the projection carries each tax year, April to
April, and settles it in the April after: the year's income tax on everything
its months earned and drew from a pension, and its Class 4 on all their profit,
less what they paid, is refunded into that month's money or owed out of it.
Class 1 is charged a pay period at a time, as the months charge it, and is not
settled. The first tax year is the months of it the plan holds, against their
share of each band. The bands are held as they stand, in today's money as the
lines are, until the plan carries an inflation assumption.

A debt's own fixed sum is a loan's payments, so it runs only until the loan
maths in `src/lib/loans.ts` says they clear what is owed: the term the payment
takes at the debt's rate, counted from the month the plan is read in, and
nothing charged after the month the last payment falls in. A debt whose payments
an expense line carries is left out of the fixed sums as before, the line being
the payment and carrying its own end. Saving a debt whose fixed payment never
clears it is refused, since a payment the month's interest swallows gives the
projection no month to stop at.

A month the income does not cover is drawn out of the savings at the start of
it, before the month's growth: cash first, then the tax-free wrapper, then the
tax-deferred one and only from the year its owner turns 57, an age held as a
constant in the engine until that same assumptions screen exists, as the plan
rate is held in the store. Each account is drawn to nothing and no lower, and
what a year could not draw from anywhere is carried on its point, so the
projection can say when the money runs out and the dashboard's chart marks that
year. Cash and the tax-free wrapper give up what the month is short, and a
pension is grossed up so that what is left of the draw once taxed is what the
month is short: a quarter of each draw is free of tax until the £268,275 lump
sum allowance is used up over the plan, and the rest is taxed as income on top
of what the month earned. Every line is taken at the amount it states, in
today's money, until the plan carries an inflation assumption.

The dashboard reads the projection through `src/store/plan.ts`, a cached read
keyed on the accounts and the lines, so a save on the accounts or the plan
screen is a new projection on the next render. The cached reads every screen
goes through live under `src/store`, and the server actions a save goes to under
`src/actions`: neither is a route, and the organisms that save through an action
sit beneath the routes.

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

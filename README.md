# exactis

Certitudo in numeris

A financial planner for one UK household. It projects savings, pensions,
property and debts month by month, after each owner's own tax, through
retirement to a chosen end age.

Next.js, React 19, Tailwind CSS and shadcn/ui over Base UI, with the household
in Postgres on Neon and the app on Vercel.

## The screens

- Dashboard — the projection, account by account, with milestones and, unless
  retirement is on conditions, a draggable retirement age.
- Chance of success — the plan across a thousand simulated futures of the
  markets.
- Accounts & assets — the owners and children, and every balance, house, car and
  debt. Updating the balances at a month's end records a progress point.
- Income & expenses — the income and expense lines, the milestones, and what a
  month of each year puts by or draws.
- Progress — the balances month by month from the progress points, with the
  house revalued by the Land Registry's house price index.
- Assumptions — the rates, typed or derived from the Bank of England's implied
  inflation curve, BlackRock's capital market assumptions and a target
  allocation imported from Portfolio Performance; the glide path; and each
  owner's State Pension.
- Cogitator — what to buy next, towards that target allocation.

A scenario is a what-if copy of the household, or of another scenario. Every
screen, and export and import, works on whichever is open. Adopting one makes
its plan the household's, keeping the household's own bookkeeping: balances,
progress points and what was pulled in.

## Getting started

Bun runs the app, at the version `packageManager` pins; the git hooks also need
Node, at the version `.node-version` pins. Copy `.env.example` to `.env.local`
and fill it in as its comments say, with `DATABASE_URL` on a Neon branch of your
own. A migration runs as the branch's owner, so it takes the owner's URL at a
prompt:

```bash
bun install --frozen-lockfile
( read -rs DATABASE_URL && export DATABASE_URL && bun run db:migrate )
bun dev
```

The gates are `format:check`, `lint`, `cycles`, `typecheck`, `knip`,
`test:coverage`, `build` and `test:e2e`. Commits are held to the first five,
over what they stage, and pushes to the suite; CI runs all eight at the tip and,
once a pull request is out of draft, at each commit beneath it.

## Layout

- `src/engine/` — the projection, a month at a time, and its futures.
  [`src/engine/README.md`](src/engine/README.md) is the model's specification.
- `src/data/` — the household's model, the rules every save is held to, and the
  derived rates.
- `src/db/`, `drizzle/` — the table, its queries and its migrations.
- `src/store/`, `src/actions/` — the reads every screen goes through, and the
  server actions every save goes to.
- `src/lib/` — shared helpers, the session and most of the file readers among
  them.
- `src/components/` — vendored shadcn, our wrappers over it, and the app's own
  components. [`src/components/README.md`](src/components/README.md) is the map.

## The store

The household is a `jsonb` document in one Postgres table, a row per version,
read through Drizzle over Neon's HTTP driver. A save inserts the next version in
one statement, and is refused if what it was made from has changed since, or if
it breaks a rule, most of them in `src/data/household.ts`. Triggers refuse any
update or truncate, and any delete but a scenario's.

Changing the household's shape needs no migration. A change older versions
cannot be read under appends a step to `src/data/shapes.ts`, which carries them
forward on read. So does one an older build would misread by dropping what it
adds; the step makes that build refuse the new shape instead. The table itself
changes only by migration, as `AGENTS.md` sets out.

## Signing in

One password, and no user table. `APP_PASSWORD_HASH` is its scrypt hash, and
`SESSION_PASSWORD` seals the session cookie. To make the hash without the
password showing:

```bash
read -rs PASSWORD && printf %s "$PASSWORD" | bun run hash-password
```

A session lives only in its cookie, sealed with a digest of the hash, so
rotating either value and redeploying signs everyone out.

## Deploying

Vercel projects `exactis` (from `main`) and `exactis-dev` (from `dev`), each on
its own Neon branch. Migrations are applied by hand before the deploy that needs
them, and the app connects as a role holding only the grants its queries need.
[`docs/deploying.md`](docs/deploying.md) has the setup and the runbook.

## Working on it

This repository is public. [`AGENTS.md`](AGENTS.md) puts what it must never hold
before every other rule, then says how work is done: code style, commits, and
what has to be green before anything lands. [`TODO.md`](TODO.md) lists what the
model does not yet hold.

## Licence

GPL-3.0. See `LICENSE`.

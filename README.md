# exactis

A financial planner for one UK household: it projects the household's savings,
pensions, property and debts a month at a time, after each owner's own tax,
through retirement to the age its plan runs to, on Next.js, React 19, Tailwind
CSS and shadcn/ui over Base UI.

## Getting started

Bun is the only prerequisite, at the version `packageManager` in `package.json`
pins; install it from <https://bun.sh>. Then:

```bash
bun install --frozen-lockfile
bun dev
```

The app is then at <http://localhost:3000>, the dashboard rendered from
`src/app/(app)/(dashboard)/page.tsx` behind the sign-in.

Node is pinned in `.node-version`, which CI and Vercel read. With nvm, match it:

```bash
nvm install "$(cat .node-version)" && nvm alias default "$(cat .node-version)"
```

## Scripts

| Script                                | Does                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `dev`                                 | Development server                                                |
| `build`, `start`                      | Production build, then serve it                                   |
| `lint`, `lint:fix`                    | ESLint at `--max-warnings 0`, without and with autofix            |
| `format`, `format:check`              | Prettier, rewriting and reporting                                 |
| `typecheck`                           | `next typegen`, then `tsc --noEmit`                               |
| `test`, `test:watch`, `test:coverage` | Vitest; coverage enforces the per-file 100% gate                  |
| `test:e2e`                            | Serve the last `build` and sign in to it over HTTP                |
| `db:generate`, `db:migrate`           | Write a migration from the schema, then apply the pending ones    |
| `hash-password`                       | Hash the password piped in, for `APP_PASSWORD_HASH`               |
| `mcp:next`, `mcp:shadcn`              | The Next devtools and shadcn MCP servers, launched by `.mcp.json` |

## The store

The household, its owners, each with the year they were born and the age they
retire at, its accounts, milestones, income lines, each naming the owner who
earns it, and expense lines, the month at whose end its balances were read, the
progress points its balances were read at month by month and when the Land
Registry's house price index was last written into them, the age the plan runs
to, the rates and the split of the savings the plan runs on, the inflation curve
last pulled from the Bank of England, the vintages of BlackRock's capital market
assumptions last pulled and the target allocation last imported from Portfolio
Performance, lives in Postgres as one document, a version of it a save, reached
through [Drizzle](https://orm.drizzle.team) over Neon's HTTP driver. Every
version is kept on a branch, the household itself or a scenario by its name,
each counting its versions from one. The table is `src/db/schema.ts`, the
migrations generated from it are in `drizzle/`, and the queries, each naming the
branch it reads or writes, are in `src/db/household.ts`: reading the latest
version, keeping the next, reading the version the rates stood at on a day,
listing the scenarios and dropping one.

A save reads the latest version, makes the household it leaves, holds the whole
of it to the rules in `src/data/household.ts`, and keeps it as the version after
the one it read, in one statement. So a save lands whole or not at all, one the
household changed under since it was read is refused rather than written over
the other, and a save that breaks a rule is refused in the rule's words. No
version is written over, none of the household's is deleted, and the table is
never truncated, which it holds with triggers, so every household the store has
held stays; a scenario can be dropped, every version of it at once, where the
household never can. A read holds the latest version to the same rules before
any screen draws from it.

A scenario is a branch of the household in the same table: the household is the
branch with no name, and a request opens a scenario by the `exactis_scenario`
cookie naming it, so every screen, action, rule and engine run works on
whichever is open without knowing which. The store reads and writes the branch
open, so whatever is saved in a scenario, a balance typed or a CMA pulled as
much as a retirement age dragged, stays there, and the household's history is
untouched: bookkeeping belongs in the household, and what-ifs in a scenario. The
cookie names a branch and guards nothing, so it is not sealed: the session's
cookie is what lets a request in, and the cookie ends with the browser's session
or its sign-out, so the next visit opens on the household. A name no scenario is
kept under, as one dropped since, reads as the household on a page, but a save
under it is refused, so an edit meant for a scenario never lands in the
household. The branch open is the browser's, shared by its tabs, so a form
filled in one saves to whichever branch another has opened since. A page reads
the branch once a request, through React's cache, and an action reads the cookie
and the store afresh. The household itself is read beside a scenario for the
dashboard to compare the two.

The actions in `src/actions/scenarios.ts` make a scenario, enter one kept, leave
it for the household, delete one and adopt one, and the dashboard's header
offers them in one menu, which opens the household or any scenario kept, makes a
new one, and asks before the one open is made the household or deleted. A
scenario is made from whichever branch is open, the household or another
scenario, its latest version copied whole as the scenario's first, balances and
progress points included, and is opened as it is made. Adopting one keeps the
scenario's plan over the household's bookkeeping as the household's next
version, under the household's own check that nothing was saved there since it
was read, so what was recorded in the household while the scenario was explored
is not rolled back. The bookkeeping is the household's: each account's balance
and the day it was set, the month the balances are as of, the progress points,
and what was pulled from outside, the house price index, the CMA and the
inflation curve. The rest is the plan, and the scenario's: the owners, the
accounts and what pays into them, the milestones, both schedules, the ages, the
rates typed and which set is live, the split, the glide path, the deductions,
and the target allocation and its mappings. Balances go by account: an account
in both takes the household's, one the scenario added keeps its own, and one
only the household holds is gone, since the scenario deleted it. The merge is
held to every rule, as any save is. The versions of the scenario up to the one
adopted are then dropped, so one saved to it since stays. The store runs no
transaction, so the write comes first and the drop second: a drop that fails
leaves a scenario already adopted, and nothing lost. While a scenario is open, a
banner naming it heads every screen, with a button that leaves it for the
household, so nothing is edited without saying where it is saved.

The plan is the first listed owner's, as the first listed account is the first
paid: it runs to the age they reach, and the retirement its lines are tied to is
theirs. A household holds an owner at least, so it opens with one, and the last
cannot be deleted. The accounts and plan screens read and write it, the
dashboard projects what it holds and saves the age the plan runs to, the age its
owner retires at and the drawdown, and the assumptions screen types the rates,
the deductions and the split of the savings into it, chooses the set of rates
the plan runs on, pulls the inflation curve and the CMA into it, and imports the
target allocation into it and maps its categories; the progress screen reads the
progress points, which the accounts screen's month end records off the balances
it closes, and pulls the house price index into them. The sidebar hands the
household, or the scenario open, out as a file, as a save would keep it, and its
balances as one row of the owner's balances sheet. A file is read back in as the
next version of what is open, refused as any save is. `DATABASE_URL` names the
database, as `.env.example` shows. Nothing reads it until a query runs, so a
build needs no database. Locally, point it at a Neon branch of your own and
apply the migrations once:

```bash
bun run db:migrate
```

The household's shape is the model's rather than the table's, so changing it is
a change to `src/data/household.ts` and no migration. Every save stamps the
household with the shape it is kept in, numbered in `src/data/shapes.ts`, and
every read carries a version through the steps there from the shape it was kept
in to this app's before the model's rules are held to it. A household kept
before shapes were numbered carries no stamp and is in the first. A change to
the model that a household kept before it cannot be read under is a step
appended there, taking the shape before to the new one, which counts
`currentShape` up by itself. So a version kept in an older shape is read as it
stands rather than refused, nothing is rewritten to carry it forward, and the
store is never emptied; a version stamped by a newer app than the one reading it
is refused, since it may hold what this one cannot read, and one the steps
cannot carry into a household the rules hold is refused in their words, the way
through being a step. Only the latest version is read whole. An older one is
read only for the sources its rates rest on, to show what moved them, through a
schema of their own that defaults what a version too old to hold them lacks. A
change to the table is a new migration, written with `db:generate` and committed
with the change, with whatever drizzle-kit cannot write, such as the trigger,
written into it by hand. A migration is applied before the app that needs it is
deployed, so the app already running has to run on the migrated table in
between: the scenario column defaults to the household, so that app reads and
writes the household's versions as it did. The tests apply the migrations to an
in-process Postgres ([PGlite](https://pglite.dev)), so a migration that does not
apply fails the suite before it reaches a database.

## The projection

The engine is `src/engine/projection.ts`: a pure function over the accounts, the
income and expense lines and a plan, giving a point per year to the plan's
horizon, each the balance entering that year. Each month of it is worked out by
`src/engine/cash-flow.ts` in that month's pounds, and every point is read in
today's money, the money of the month the plan starts in. The rules both work
by, from the tax on a month and the bands' freeze until April 2031 to the draw
on the savings and what a point is worth, are specified once, each with its
reason, in [`src/engine/README.md`](src/engine/README.md), and
[`TODO.md`](TODO.md) lists what the model does not yet hold. The plan grows at
the live set of rates, typed or derived from the capital market assumptions,
below.

The dashboard reads the accounts, the lines, the milestones and the plan from
the store and hands them to the browser, which runs the engine itself, so a save
on the accounts or the plan screen is a new projection on the next render and a
retirement age dragged on the dashboard is projected as it moves, the lines tied
to retirement moving with it. Chips over the chart choose a milestone, and the
first tile reads what the plan holds entering its year on the measure the
milestone is on, the liquid net worth for a milestone reached on that and the
net worth for one reached on it, at an age or for retirement, retirement's to
begin with; a milestone reached when conditions hold stands in the year by which
half the futures have reached it, and the figure is still the plan's own
projection entering that year. A second tile reads the plan's net worth entering
its last year, at its own rates: the one figure the chance of success's futures
spread either side of, and the one its screen sets the middle future against.
The header names the set of rates the plan runs on, the CMA's vintage with it
when that set is live. While a scenario is open the dashboard reads the
household too and sets the scenario beside it: the browser projects both and
draws futures for both, each tile carries what the scenario differs from the
household by, the milestone and the net worth in pounds and the chance of
success in percentage points, and the chart draws the household's total on the
basis it counts as a dashed line over the scenario's columns, named Household
under the crosshair. The retirement age dragged there is the scenario's, and
saves to it. The reads every screen goes through, one read of the latest version
a request, and the save every action makes live under `src/store`, and the
server actions a save goes to under `src/actions`: neither is a route, and the
organisms that save through an action sit beneath the routes.

The dashboard's chart stacks each account the plan holds or owes a year at a
time, and marks the first year the money runs out in and the first year a
pension is drawn before its owner's pension age. The plan screen's year book
draws every year that falls short either way in the loss tone, saying beneath
the month what was drawn early. The drawdown is chosen in the dashboard's
assumptions dialog, beneath the age the plan runs to, and each owner's
qualifying years for the State Pension are typed on the assumptions screen, the
line they make listed locked on the plan screen. The plan screen reads a month
on its own, in today's money as Today's money in the specification reads one,
and shows the cap an account is paid to as it is stated, as the line is. A bonus
paid once a year shows in its month alone, so the month the plan screen reads,
the plan's first and each January after it, shows none of a bonus paid in
February and the whole of one paid in January.

The tiles, the milestones and the chance of success read the net worth and the
liquid net worth as the specification counts them, a pension as drawn at the
basic rate. The chart stacks each pension at the same figure, on the liquidity
only from the year the liquid net worth counts it, so on either basis the stack
comes to the figure the tiles read. The accounts screen's starting net worth
takes off the tax on the pensions counted so, read off the engine's own count
with each owner's allowance whole, so it is the net worth the plan opens on to
the pound; the month end's total is the balances as the statements have them, a
pension at what it holds.

## Inflation

The plan's inflation is one of its rates, typed by hand or derived. A rate is
derived from the Bank of England's implied inflation curve, which the Bank
publishes each working day in one zip of its gilt curves. Pressing Pull latest
curve on the assumptions screen runs the action in `src/actions/inflation.ts`,
which fetches the zip from the server, and `src/lib/yield-curves.ts` reads the
spot curves of the implied, nominal and real workbooks out of it. Nominal less
real is then checked against implied at every maturity the latest day gives, and
only then is that day's curve kept in the household, at 5, 10, 20 and 30 years.
The check catches a sheet read wrongly, since the Bank works the implied curve
out as that difference.

The rate is worked out from the curve whenever it is read, in
`src/data/inflation.ts`. It starts from the implied rate at 20 years, the
horizon a capital market assumption is quoted over. Index-linked gilts are
priced on RPI, which runs above CPIH until the two are aligned in February 2030,
so the share of a 0.65-point wedge carried by the years before then comes off.
Then 0.3 points comes off for the premium the market pays for protection. The
household keeps the curve as the Bank gave it rather than the rate it makes, so
a change to the method moves the rate without another pull. The assumptions
screen lays those steps out beside the curve at 5, 10, 20 and 30 years. The plan
takes the derived rate when it runs on the rates derived from the capital market
assumptions, below, and otherwise the inflation typed into its rates, which a
household opens on at the Bank of England's 2% target. The projection grows the
lines with whichever it takes, and the tax bands once their freeze ends in April
2031, under The tax on the month in
[`src/engine/README.md`](src/engine/README.md).

## Capital market assumptions

BlackRock publishes its capital market assumptions as one workbook, replaced
with each vintage. `src/actions/cma.ts` fetches it from the server and
`src/lib/cma-workbook.ts` reads its starting point: the vintage, the day its
data are as of, and the 20-year expected return of each asset class it prices in
sterling, equities blending into the plan's stocks and fixed income into its
bonds, private markets left out. Nothing is read by position. The header is
found by its first cell and the 20-year column within the block of expected
returns, since the interquartile ranges beside it head their columns the same
way. A return past what any market has returned, below losing everything or
above 50% a year, is refused as an unknown header is, naming the class and the
figure, so a workbook in percent units is refused at the pull rather than kept.
BlackRock prices a hedged return only in dollars, so each class it prices hedged
in dollars and unhedged in sterling gains a sterling-hedged form, the
dollar-hedged return carried from US to UK cash. Japan's large caps, which
sterling stopped pricing in August 2026, and US small caps are priced only in
their own markets' currencies, so each is carried into sterling by its gap over
US large caps there, added to sterling's US large caps: the currency moves out
of a gap between two unhedged classes, as BlackRock's own figures show for the
classes every block prices.

The household keeps the latest vintage and the one it replaced, so what a new
vintage moves can be read. The same vintage pulled again replaces the latest,
and an earlier one is refused.

The rates are derived in `src/data/cma.ts`. Each sleeve's return is the target
allocation's blend of the classes its categories are mapped onto, each category
weighted by its share of the sleeve; a class hedged to sterling is blended at
the return of the class it hedges, with the hedging kept apart as an adjustment.
The blend is linear in the classes' geometric returns, and the plan rate is the
same blend of the sleeves, so the derived set adds what a portfolio rebalanced
yearly to its weights earns over the blend: half the gap between the classes'
variances in their weights and the portfolio's, earned within each sleeve and
between the two, read from the same volatilities and correlations the chance of
success's spread is, which at the fixture's split is about 0.4 of a point. A
vintage pulled before its volatilities were read gives nothing to work it from,
and the plan runs on the blend; the rates typed carry no volatilities and earn
nothing either. The worksheet shows it as a row of its own. A sleeve nothing
blends into, as bonds in an allocation all in equities, stands in at the other's
return with none of the whole, so its rate weighs nothing, and the screen shows
it as empty. The household keeps two deductions, typed: the fees every fund
charges, which BlackRock's index returns are gross of and the plan charges
nowhere else, and the dividend yield, which the workbook does not carry, each
held to a tenth at most, since no fund charges or yields more. Both open on the
figures the manual method settled on in September 2026, 0.20% of fees and a
2.00% yield, until they are typed over. Stocks grow at their blend less both,
with the yield on top as their dividend yield, so the two add back to the blend
less fees; bonds grow at theirs less the fees. Inflation is the curve's derived
rate, since the returns are nominal.

The household keeps which set the plan runs on, the rates typed or the derived,
and leaves the other as it was. The derived set carries its own split of the
savings, the target allocation's between the sleeves, so the plan holds stocks
and bonds in the shares the rates were blended for; the split typed is kept for
the rates typed. The derived set is held to being whole while it is chosen: a
vintage, a curve and a target allocation pulled, and every category asking for a
share mapped onto a class the vintage prices. A save that would leave it short,
the choice of it included, is refused saying what is missing, rather than the
plan falling back on the rates typed without a word.

The assumptions screen's rates tab chooses the set as a radio is pressed. Under
the CMA-derived set it shows the derived rates read-only, each with where it
comes from, beside stocks' total, the move the latest vintage made in it from
the one before, and the vintage; under the rates typed it shows them to type.
The return source card beneath pulls the workbook, types the two deductions, and
lays out a ledger a sleeve from the blended return to the growth the rates take,
the hedging adjustment under bonds, beside every category's share of the whole.
Beneath it, under the derived set, the target split the plan runs on is drawn
with what the vintage expects of each sleeve and of the portfolio before fees,
where the rates typed show the split typed. A line above the cards says which
set is live, since the manual method's worst failure was a plan running on a set
nobody knew was live.

## Target allocation

The target allocation is read from the file Portfolio Performance saves in
binary: a zip holding `data.portfolio`, the signature `PPPBV1` and then the
protobuf of the whole client. `src/lib/portfolio-file.ts` reads its Asset
Allocation taxonomy and nothing else, through the wire reader in
`src/lib/protobuf.ts`, using the field numbers from Portfolio Performance's
`client.proto`. Each class with no class beneath it is a category, and its share
of the whole is its weight multiplied by the weight of every class above it. The
categories are kept with the classes above them, the id Portfolio Performance
gives each, and whether any holding is assigned to it. The import action in
`src/actions/targets.ts` takes the categories rather than the file, since the
holdings and transactions the file holds beside them are not needed, and keeps
them with the day they were imported. The household refuses a set whose shares
do not add up to 100%, or that lists a category twice. Each category can be
mapped onto an asset class the latest CMA prices, by `mapCategory` in the same
file, and the mapping is kept by the id Portfolio Performance gives the
category, so an import of the file saved again keeps it. `mapByName` maps every
category the CMA cannot blend onto the class its name suggests, from the table
in `src/data/class-table.ts`, and leaves a category on a priced class as it was
chosen. A mapping outlives the category leaving the allocation and the class
leaving a vintage, so neither has to be chosen again when it comes back. The
plan reads the target allocation only through the rates derived from it.

The assumptions screen holds it in a tab of its own beside the rates. Pressing
Reload from Portfolio Performance picks the file on the device, and the reader
runs in the browser, so the file never leaves it and no upload limit applies:
only the categories are posted to the action. The tab lays each category out
with the classes above it, the class of the latest CMA it is mapped onto with
that class's 20-year return, and its target, and flags one that asks for a share
but has nothing assigned to it, no class, or a class the vintage no longer
prices. The class is chosen in the row, from the vintage's classes under their
sleeves' headings, and saved as it is chosen. While any category the CMA cannot
blend has a class its name suggests, the card offers to map them all by name at
once, saying how many.

Pressing Retarget from LifeStrategy 80% Equity picks the file the same way and
sets its weights from what Vanguard's LifeStrategy 80% Equity fund holds, at 90%
equity and 10% bonds in the fund's own ratios. `src/actions/lifestrategy.ts`
asks Vanguard's site what the fund holds, as the fund's own page asks it, and
hands the holdings back without keeping them, since Vanguard answers only its
own site from a browser. The browser then matches each fund to the category
standing for it, by the fund's SEDOL through the table in
`src/data/class-table.ts`, in `src/data/lifestrategy.ts`; where two categories
stand for one fund the one asking for the larger share takes it, a fund no
category stands for is refused by name, and a category standing for none of the
fund's asks for nothing. `reweighted` in `src/lib/portfolio-file.ts` writes the
weights down the taxonomy, each class's share over its parent's rounded so the
classes beneath each parent add up to it, and the file as rewritten is imported
as a chosen file is, so the targets kept are the ones the file now holds. The
rewritten file can then be downloaded under its own name and saved over the
original, so Portfolio Performance and the store hold one allocation.

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

On a development machine `.env.local` holds the hash of a throwaway password,
with the throwaway itself on a `# password:` comment line above it, so an agent
signs in as anyone would by reading that one line rather than the file.

## Deploying

The app is built for Vercel with Neon behind it. Adding Neon from the Vercel
Marketplace sets `DATABASE_URL` on the project; `SESSION_PASSWORD` and
`APP_PASSWORD_HASH` are set by hand, as `.env.example` describes. A build needs
none of the three. The migrations are applied from a terminal with the
production URL in `DATABASE_URL`, before any deploy that adds one, so no deploy
runs against a store that lacks what it reads:

```bash
bun run db:migrate
```

That order holds only while the code already deployed still runs against the
migrated store, so a migration never takes away or tightens what that code
relies on. A column it does not write lands open or with a default, and a column
is dropped, renamed or closed only by a later migration, once no deployed code
reads or writes it.

The URL the integration sets is the owner role's, which can alter the table,
turn its triggers off or drop it, so production runs as a role of its own that
can do only what `src/db/household.ts` does: read the versions, keep one, and
drop a scenario's, which alone the trigger lets go. A role made in SQL is not a
member of `neon_superuser`, as one made in Neon's Console, CLI or API is, so it
is made in SQL. This assumes the Vercel-managed integration, whose database is
listed under Storage in the Vercel dashboard. A database added from the Neon
Console is the Neon-managed one, disconnected under Integrations there instead,
and its guide does not say that disconnecting takes its variables off the
project, so the check in step 4 is what makes sure. In order:

1. Take the owner's URL from the Neon Console, under Connect on the production
   branch, as the owner role with pooling on, since Vercel shows none once the
   connection is removed. A URL is pasted bare wherever it goes, with no quotes
   and no `DATABASE_URL=` in front.
2. As the owner on the production branch, from Neon's SQL Editor or `psql` with
   the owner's URL, make the role, with a password from `openssl rand -hex 24`
   in place of the placeholder:

   ```sql
   CREATE ROLE exactis_app WITH LOGIN PASSWORD '<password>';
   GRANT USAGE ON SCHEMA public TO exactis_app;
   GRANT SELECT, INSERT, DELETE ON household_versions TO exactis_app;
   ```

3. Make the app's URL from the owner's, with `exactis_app` and its password in
   place of the owner's, and read through it before anything runs on it, which
   only counts the versions:

   ```bash
   ( read -rs APP_URL && psql "$APP_URL" -c 'SELECT count(*) FROM household_versions' )
   ```

4. Remove the project's connection to the database, under the database's
   Projects tab in Vercel, which takes the integration's variables off the
   project and leaves the database as it is. Never delete the database itself,
   under its Settings, which deletes the Neon project and every version in it.
   Then check the project's environment variables for any of the integration's
   left, `DATABASE_URL_UNPOOLED`, the `PG` ones such as `PGUSER` and
   `PGPASSWORD`, and the `POSTGRES_` ones such as `POSTGRES_URL`, each of which
   carries the owner's credentials, and delete any there is.
5. Add `DATABASE_URL` by hand, for Production, as a sensitive variable, set to
   the app's URL.
6. Redeploy production, since a deployment already running keeps the variables
   it was built with, and check that a page draws and a save lands.

A connection kept for a preview branch could instead be given a custom prefix,
which moves its variables off `DATABASE_URL`, but leaves the owner's URL in the
environment every build runs in. `db:migrate` keeps running as the owner, with
the owner's URL exported as `DATABASE_URL` in the terminal it runs from. A Neon
branch copies the roles and their passwords, so one made from production after
this holds `exactis_app` with production's password, and has the role dropped,
or its password reset with `ALTER ROLE exactis_app WITH PASSWORD`, before
anything uses it. A migration that adds a table grants the app role what its
queries need on it, in the same migration, and only where the role exists, since
PGlite and a branch made before it have none:

```sql
DO $$ BEGIN
	IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'exactis_app') THEN
		GRANT SELECT, INSERT ON "a_new_table" TO exactis_app;
	END IF;
END $$;
```

[AGENTS.md](AGENTS.md) is the source of truth for how work is done here: code
style, commit rules, and what has to be green before anything lands.

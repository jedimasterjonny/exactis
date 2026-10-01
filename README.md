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
| `test:e2e`                            | Serve the last `build` and sign in to it over HTTP                |
| `db:generate`, `db:migrate`           | Write a migration from the schema, then apply the pending ones    |
| `hash-password`                       | Hash the password piped in, for `APP_PASSWORD_HASH`               |
| `mcp:next`, `mcp:shadcn`              | The Next devtools and shadcn MCP servers, launched by `.mcp.json` |

## The store

The household, its owners, accounts, milestones, income and expense lines, the
month its balances are as of, the ages the plan is set to, the rates and the
split of the savings the plan runs on, the inflation curve last pulled from the
Bank of England, the vintages of BlackRock's capital market assumptions last
pulled and the target allocation last imported from Portfolio Performance, lives
in Postgres as one document, a version of it a save, reached through
[Drizzle](https://orm.drizzle.team) over Neon's HTTP driver. The table is
`src/db/schema.ts`, the migration generated from it is in `drizzle/`, and the
two queries, reading the latest version and keeping the next, are in
`src/db/household.ts`.

A save reads the latest version, makes the household it leaves, holds the whole
of it to the rules in `src/data/household.ts`, and keeps it as the version after
the one it read, in one statement. So a save lands whole or not at all, one the
household changed under since it was read is refused rather than written over
the other, and a save that breaks a rule is refused in the rule's words. No
version is written over or deleted, which the table holds with a trigger, so
every household the store has held stays. A read holds the latest version to the
same rules before any screen draws from it.

The accounts and plan screens read and write it, the dashboard projects what it
holds and saves the ages the plan runs to and its owner retires at, and the
assumptions screen types the rates, the deductions and the split of the savings
into it, chooses the set of rates the plan runs on, pulls the inflation curve
and the CMA into it, and imports the target allocation into it and maps its
categories; the progress screen still shows the reference kit's figures.
`DATABASE_URL` names the database, as `.env.example` shows. Nothing reads it
until a query runs, so a build needs no database. Locally, point it at a Neon
branch of your own and apply the migrations once:

```bash
bun run db:migrate
```

The household's shape is the model's rather than the table's, so changing it is
a change to `src/data/household.ts` and no migration. Until the store holds a
household worth keeping, a change to the shape is made in place, and a store
holding the old shape is emptied rather than carried forward, with
`TRUNCATE household_versions`, which the trigger lets through where it refuses a
delete. The milestones were taken without emptying it: a household kept before
there were any is read as listing none, one kept before there was a curve as
holding none, and one kept before there was a target allocation or a CMA as
holding none too. The rates were taken the same way: a household kept before
there were any is read with the ones it ran on, 5% for stocks and bonds alike
with no yield split out, everything in stocks, and the inflation its curve made,
so it projects as it did until a rate is typed. The triple lock was dropped the
same way: a line kept growing by it is read as growing with inflation. A change
to the table is a new migration, written with `db:generate` and committed with
the change. The tests apply the migrations to an in-process Postgres
([PGlite](https://pglite.dev)), so a migration that does not apply fails the
suite before it reaches a database.

## The projection

The engine is `src/engine/projection.ts`: a pure function over the accounts, the
income and expense lines and a plan, giving a point per year to the plan's
horizon, each the balance entering that year. So far it plots the two wrappers,
tax-free and tax-deferred, each paid into a month at a time as its accounts say
and grown at the plan rate. That is made from the rates live, one to a class and
flat for life, either those typed or those derived from the capital market
assumptions, below: what stocks return in all, their growth and the dividend
yield on top, which every wrapper reinvests, and what bonds return, each in the
share of the savings the live set holds in it, typed or the target allocation's.
Cash is carried beside them, so a short month can be drawn from it, but it is
not plotted, since the progress points a projection is laid over carry no cash
figure. The first year runs from the month the household's balances are as of,
since they are what it opens with, whatever day the plan is read on; a household
read before anything is saved takes the month it is read in, and keeps it from
its first save. What an account is paid in a month is what
`src/engine/cash-flow.ts` works out: the month's income, less what the salaries
sacrifice, the tax on the rest, what the expense lines cost and each debt's own
fixed sum, pays the other fixed sums, handed down the accounts in the order they
are listed, and what survives them is the spare money, handed down the accounts
that take it the same way, each to a twelfth of its cap. A fixed sum into
savings is therefore paid only out of what the month has, so a contribution
stops when the income funding it ends. A debt's is owed rather than saved, so it
is paid whole and first wherever the debt is listed, and a month short of it
draws on the savings as it would for an expense; the order sets which saving is
paid first, and a debt is no saving.

A pension can be marked always funded, for a pension worth keeping paid when the
month cannot, since what it is paid out of taxed money is relieved. It is paid
after the debts and before every other saving: what the salaries feeding it
sacrifice is given up, and its own fixed sum paid, out of what the month has and
then out of the cash and the ISAs, once they have met whatever spending the
month is short of. It is never paid out of a pension, and once the cash and the
ISAs are spent it is paid what the month has, as any other saving is.

The income is taxed as the UK outside Scotland taxes it for 2026/27, the rates
held in `src/lib/tax.ts`: income tax on every kind of line, with the personal
allowance withdrawn over £100,000, Class 1 National Insurance on a salary and
Class 4 on self-employed profit, and none on a pension or other income. A
sacrifice comes off the salary before either, so what it saves in tax is what it
saves the month. A fixed sum or the spare money paid into a pension comes out of
taxed money instead, so the pension claims the basic rate back on it and £800
paid lands as £1,000, which is what a pension's cap is held to; the relief a
higher rate taxpayer claims on top is theirs rather than the pension's, and is
not counted. Relief is claimed on no more than the owner earns from a salary or
self-employment, less what they sacrifice, or £3,600 a year when that is more,
so a pension paid after its owner retires lands a pound a pound past £300 a
month. Each month is taxed as a twelfth of a year, which is the year's tax
exactly when its months are alike and too much or too little when they are not,
as in the year a salary stops. So the projection carries each tax year, April to
April, and settles it in the April after: the year's income tax on everything
its months earned and drew from a pension, and its Class 4 on all their profit,
less what they paid, is refunded into that month's money or owed out of it.
Class 1 is charged a pay period at a time, as the months charge it, and is not
settled. The first tax year is the months of it the plan holds, against their
share of each band. The bands are frozen until April 2031 and are held so: flat
in pounds through the 2030/31 tax year, so an income rising with prices is
dragged into a higher band, and rising with the plan's inflation each April from
2031/32, so each tax year is charged and settled against its own.

A debt's own fixed sum is a loan's payments, so it runs only until the loan
maths in `src/lib/loans.ts` says they clear what is owed: the term the payment
takes at the debt's rate, counted from the month the plan starts in, and nothing
charged after the month the last payment falls in. A debt whose payments an
expense line carries is left out of the fixed sums as before, the line being the
payment. When it runs is the loan's to say, not the line's: whenever the
household is read, the line runs from the plan's first year to the month the
same loan maths clears the loan in, a PCP's balloon refinanced on the same
terms, or to the end of the plan when it never clears, as an interest-only
mortgage does. So a mortgage's end moves with the balances' month as a plain
debt's does. Saving a debt whose fixed payment never clears it is refused, since
a payment the month's interest swallows gives the projection no month to stop
at.

Any other line may tie its first or last year to a milestone rather than fix it,
and then runs as the milestone does. A milestone is the first year of what it
marks, so whenever the household is read a line tied to start at one starts in
its year, and a line tied to end at one runs the whole of the year before, or
ends as many whole years after it as the line says; two lines tied to it, one
each way, hand over there with no year left unpaid or paid twice. Retirement is
a milestone of its own, the year the plan's owner retires in, so a line tied to
it moves with the retirement age. A milestone moved past the other end of a line
tied to it leaves the line running no years, rather than the move being refused
over a line on another screen; a line saved that way is refused. Deleting a
milestone fixes each end tied to it in the year it falls in then, so the lines
stay where they were.

A month the income does not cover is drawn out of the savings at the start of
it, before the month's growth: cash first, then the tax-free wrapper, then the
tax-deferred one, as income from the pension age: from the year its owner turns
55 until the age rises in April 2028, and from the year they turn 57 after it,
ages held as constants in the engine until the assumptions screen sets them, as
the plan's rates are held in the store. Before the pension age a pension is
drawn only as the last resort, once cash and the tax-free wrapper are empty, and
at the 55% a payment before the pension age is charged; a registered scheme will
not normally make one, so what a year draws that way is carried on its point to
be marked rather than counted on. Each account is drawn to nothing and no lower,
and what a year could not draw from anywhere is carried on its point, so the
projection can say when the money runs out and the dashboard's chart marks that
year. Cash and the tax-free wrapper give up what the month is short, and a
pension is grossed up so that what is left of the draw once taxed is what the
month is short: a quarter of each draw is free of tax until the £268,275 lump
sum allowance is used up over the plan, and the rest is taxed as income on top
of what the month earned.

The engine works in the pounds of each month and reads out in today's money, the
money of the month the plan starts in. A line states its amount in today's
money, and is paid it risen from there a month at a time at the rate its growth
gives: the plan's inflation, a point or two over it, or nothing for a line fixed
in nominal terms. A loan's payments are always fixed so, whatever the line was
saved with, since the loan maths reads one payment for the whole term.
Everything an account states is in the pounds of the day, as a statement or an
agreement gives it: its balance, its fixed sum, its cap and its rate, the plan
rate among them, which is a nominal return. So are the figures the law sets and
does not raise, the ISA and pension allowances, the lump sum allowance and the
£3,600 of relief. A point divides every balance by how far prices have risen by
the start of its year, and what the year went short or drew early by a month at
a time by how far they had risen by that month, so the chart and its tiles are
in today's money. The plan screen's month is read the same way, so a line rising
with inflation reads at what it states in whichever year is shown, and what an
account is paid reads at what it is worth then; the cap it is paid to is shown
as it is stated, as the line is.

The dashboard reads the accounts, the lines, the milestones and the plan from
the store and hands them to the browser, which runs the engine itself, so a save
on the accounts or the plan screen is a new projection on the next render and a
retirement age dragged on the dashboard is projected as it moves, the lines tied
to retirement moving with it. Chips over the chart choose a milestone, and the
first tile reads the balance the plan holds entering its year, retirement's to
begin with. The reads every screen goes through, one read of the latest version
a request, and the save every action makes live under `src/store`, and the
server actions a save goes to under `src/actions`: neither is a route, and the
organisms that save through an action sit beneath the routes.

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
household kept before there were rates opens on at the derived rate, or at the
Bank of England's 2% target when no curve had been pulled. The projection grows
the lines with whichever it takes, and the tax bands once their freeze ends, as
above.

## Capital market assumptions

BlackRock publishes its capital market assumptions as one workbook, replaced
with each vintage. `src/actions/cma.ts` fetches it from the server and
`src/lib/cma-workbook.ts` reads its starting point: the vintage, the day its
data are as of, and the 20-year expected return of each asset class it prices in
sterling, equities blending into the plan's stocks and fixed income into its
bonds, private markets left out. Nothing is read by position. The header is
found by its first cell and the 20-year column within the block of expected
returns, since the interquartile ranges beside it head their columns the same
way. BlackRock prices a hedged return only in dollars, so each class it prices
hedged in dollars and unhedged in sterling gains a sterling-hedged form, the
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
A sleeve nothing blends into, as bonds in an allocation all in equities, stands
in at the other's return with none of the whole, so its rate weighs nothing, and
the screen shows it as empty. The household keeps two deductions, typed: the
fees every fund charges, which BlackRock's index returns are gross of and the
plan charges nowhere else, and the dividend yield, which the workbook does not
carry. Both open on the figures the manual method settled on in September 2026,
0.20% of fees and a 2.00% yield, until they are typed over. Stocks grow at their
blend less both, with the yield on top as their dividend yield, so the two add
back to the blend less fees; bonds grow at theirs less the fees. Inflation is
the curve's derived rate, since the returns are nominal.

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

[AGENTS.md](AGENTS.md) is the source of truth for how work is done here: code
style, commit rules, and what has to be green before anything lands.

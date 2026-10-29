# The model

This is the specification of the model the engine runs: the rules a month and a
run of the plan are worked out by, each with its reason, stated once under a
heading of its own. [`TODO.md`](../../TODO.md) lists what the model does not yet
hold.

The engine is pure. `cashFlow` in `cash-flow.ts` works out one month from the
accounts, the income and expense lines and the plan, and `project` in
`projection.ts` carries the accounts over the plan's years a month at a time,
reading each month off `cashFlow`. Neither reads the store, the clock or a
screen, so the same accounts, lines and plan give the same month and the same
run wherever they are read.

A household has one or more owners, each taxed as a person; one is the plan's
owner, whose age the plan runs to and whose retirement is the milestone
Retirement. It may list children as well, who hold nothing and earn nothing, and
at whose ages a milestone may be reached. The wrappers are the ISAs and the
pensions, and the savings are those with the cash and the GIAs. A run reads a
point a year, the balances entering it. A month can also be read on its own,
without the run around it, and where it then knows less than the run, the
section says what it assumes. The futures the chance of success reads, in
`futures.ts`, carry the run along paths of the markets and are specified beside
that code, not here.

## The month

A month's money is worked out in the order it is paid. The income lines running
in the month come in as they are earned. What a salary sacrifices into its
pension comes off first, then the income tax and the National Insurance on the
rest, then what the expense lines cost, then each debt's own fixed sum, whole
and before any saving wherever the debt is listed. What that leaves pays the
pensions kept paid their fixed sums, then the other fixed sums, handed down the
accounts in the order they are listed, each taking its sum or what the month
still has when it no longer covers it. What survives them is the spare money,
handed down the accounts that take it in the same order, each up to its cap and
its owner's allowance and passing the rest on. What none of them takes is left,
and the plan takes it as spent rather than saved.

So the spare money is what the month has after tax, and an account taking it is
paid money the month really has rather than the tax bill on top. What is left is
below nothing by the expenses, the debts' payments, what the salaries give up
into the pensions kept paid and what those pensions are paid that the income
after its tax does not cover, and by what a settlement owes out of the month,
the tax year's or a move's, and by nothing else; the run draws that much from
the savings, under The draw.

A fixed sum into savings is a contribution out of what the month has, not a draw
on the savings: an account is paid only while the income funding it lasts, so a
contribution stops when that income ends, since selling savings to keep a
payment into a wrapper going would be a shortfall the plan read back as saving.
A pension kept paid is the one exception, under Pensions kept paid.

A debt's fixed sum is owed rather than saved, so it goes out with the expenses
and is drawn for as they are when the month is short of it, rather than going
short itself: a debt short of its payments is a debt in default, which the plan
does not model. It comes before the other fixed sums because it is drawn for:
met after them, it would sell savings to keep a saving paid. The order the
accounts are listed in sets which saving is paid first, and a debt is no saving.

What is left within a nanopound of nothing is nothing exactly. A month whose
lines cancel to the penny need not cancel in binary, and a shortfall too small
to write down is no shortfall to draw savings for: the residue of adding the
lines up would otherwise draw a fraction of a penny out of the savings in every
month of the plan. The same reading decides whether a month is short enough to
drop a sacrifice, under Salaries and what they feed, so the two are read against
the one rule, and a plan whose month cancels to the penny does not drop every
sacrifice in every month of it over that residue.

A yearly figure is spread over the twelve months, a fixed sum stated a year
among them, as if paid monthly. A salary's bonus is the exception. Its amount is
stated for the same period as the salary's, and it is paid as the line says: a
twelfth of the year's bonus every month, as a line that says nothing is paid; a
quarter of it in March, June, September and December; or the whole of it in a
month of its own. So a bonus month meets the 2% rate of Class 1 past a month's
upper earnings limit, as PAYE charges it, and its income tax, charged on the
month as a twelfth of a year, is settled with the year.

## Lines and milestones

A line other than one paying a loan may tie its first or last year to Retirement
or to a milestone reached at an age rather than fix it, and then runs as the
milestone does; one paying a loan runs as the loan does, under Debts. A
milestone is the first year of what it marks, so whenever the household is read
a line tied to start at one starts in its year, and a line tied to end at one
runs the whole of the year before, or ends as many whole years after it as the
line says; two lines tied to it, one each way, hand over there with no year left
unpaid or paid twice. Retirement is a milestone of its own, the year the plan's
owner, the first the household lists, retires in, so a line tied to it moves
with the retirement age.

A milestone reached at an age is reached at someone's: the plan's owner's, as
one naming nobody is, so a milestone kept before an age could name anyone keeps
its year; another owner's; or a child's. It falls in the year that person was
born plus the age, read off the year born as every age the plan reads is, so a
child's month of birth is not read and the whole of the year counts as reaching
it. A milestone for a child measured on the plan's owner's age instead falls in
the same year only by arithmetic, and moves if the plan passes to another owner.
Whatever reads the milestone's year reads that person's: a line tied to it, a
move made at it, the plan screen's list and the chance of success, which places
it in the same year of every future. An owner or a child a milestone is measured
on is not deleted, since the milestone would then fall in no year; it is
measured on someone else, or deleted, first. A retirement is reached at its
owner's own age and never at anyone else's, since it is when they stop working.

Leaving school is a child's milestone the milestone dialog fills in, not a
condition of its own: choosing a child offers the age they finish Year 13 in
England at, by the year born, 19 for a child born from September to December and
18 for one born from January to August, since the school year runs from 1
September to 31 August. It is offered only where that year falls within the
plan's, as any age typed is held to them, since a child who has left already or
leaves after the plan ends has no year of the plan to mark. It is kept as an
ordinary age on that child, so the month of birth decides it once, where it is
filled in, and the plan reads it as it reads every other age.

A salary or a self-employed profit stops when the owner who earns it retires,
whatever its line says, since money earned by working is not earned once the
work stops: the plan's owner's at Retirement, and another owner's at the age
they retire at, since the milestone is the plan's owner's alone, or at
Retirement where they retire with the plan's owner. A line ending before then
ends where it says, and a pension or any other income runs on.

A milestone moved past the other end of a line tied to it leaves the line
running no years, rather than the milestone being refused over a line tied to
it; a line saved that way is refused. Deleting a milestone fixes each end tied
to it in the year it falls in then, so the lines stay where they were. A
milestone a house moves at cannot be deleted, since the move has no year of its
own to be fixed in.

## The State Pension

The new State Pension is paid on each owner's qualifying years. It is the
household's own line rather than one kept, made from the owners whenever the
household is read, and paid as the owner's income, taxed with the rest of it and
charged no National Insurance. Thirty-five years or more earn the full £241.30 a
week for 2026/27, held as £12,548 a year, fewer than ten earn nothing, and each
year between earns a 35th of it, to the pound. It is paid in today's money from
the year the owner reaches their State Pension age to the end of the plan: 66
for those born by 1960, 67 for those born from 1961 to 1977 and 68 from 1978,
read off the year born as the pension age is, so the months by which the age
phases up are not held. It rises with inflation, which the triple lock pays at
least; what the lock pays above prices is not modelled, nor deferring it, nor
the starting amount of years before 2016.

An owner's years may be dated by the tax year they run through, held as the year
it opens in, and the two are written together as one record, since each is right
only with the other. A tax year is held only beside the years, and one that has
not ended is refused where it is typed, since its year is not yet earned; a tax
year cleared goes. Years with no tax year are taken as they stand. Dated years
are counted forward from it: each tax year after it that opens before the year
the owner retires in adds one, since the year before retirement is the last one
worked, and none opening in or after the year they reach their State Pension age
does, since no year is earned past that age. A record of thirteen years through
2025/26 for an owner retiring in 2053 is counted on through 2052/53 to 40, which
earns the full amount, as 35 does. Every year before retirement is taken to be
worked and to qualify: a year at home, a part-time year below the Lower Earnings
Limit and a year credited for Child Benefit or caring are not told apart, and
none is checked against what the owner earns.

The retirement counted to is the one the plan lays out. For an owner retiring at
an age, or with a plan's owner who does, the household knows it when it is read,
and the line is made then. For a retirement on conditions the plan read lays the
retirement in the year after it ends, so the line made on the read counts to the
earlier of that year and the year the owner reaches their State Pension age, and
a run counts again once it retires them, as it reads every line tied to
retirement again, so the plan at its own rates and each future pay the State
Pension their own retirement earns, and a count that falls below ten years drops
the line. The run that finds the year pays the State Pension as well, and
nothing is run twice to settle it: the count stops at the State Pension age and
the pension is paid only from it, so a retirement placed before that age is
placed before any of it is paid, and one placed after leaves the count where it
was. What the State Pension pays can therefore never move the year it is counted
to.

## Salaries and what they feed

A salary may feed a pension by sacrifice, a share of its base from none of it to
all of it. A salary feeds a pension of the owner who earns it, since a sacrifice
is an employer's contribution to the employee's own pension, and the household
refuses one feeding another owner's. The household refuses a salary naming a
pension it does not list, and removing a pension unlinks the salaries feeding
it; a month handed one anyway earns it whole.

A sacrifice comes off the salary before the tax is charged, since it is never
paid to its owner at all: the salary pays income tax and National Insurance on
what is left of it, so what the sacrifice saves in tax is what it saves the
month, and it costs the month less than it puts in the pension. The pension is
fed the sacrifice with the employer's National Insurance saved on it, over and
above whatever fixed sum the pension is paid in its own right.

An employer that matches the sacrifice pays its match into the same pension,
pound for pound with the sacrifice up to the share of the base the line states,
so 12% of the base given up and matched to 6% lands 19.8% of it: the 12%, the
employer's 15% NI saved on it, and the match. The match was never the
employee's, so it comes off nothing they are paid, pays no tax or National
Insurance, and counts against the pension allowance as the sacrifice does. An
employer that pays a floor whatever is given up pays that share where the match
falls short of it, so 2% of the base given up under a floor of 4.5% and a match
to 6% lands the 2% with its NI and 4.5% from the employer.

What a salary feeds lands whole whatever room its owner's pension allowance has,
since the sacrifice is the employer's contribution under the scheme and the
scheme pays it in with its match; what lands past the allowance is charged as
the owner's income, under The allowances and relief.

A month that cannot afford a sacrifice into a pension marked droppable does not
make it. Into such a pension the salaries sacrifice only while what the income
leaves once they have given it up and the rest is taxed, with any settlement the
month carries, still covers the expenses, the debts' payments, what the salaries
give up into the pensions kept paid and what those pensions are paid, a month
short of them by less than a nanopound covering them. In a month really short of
them no such line sacrifices at all: every one is earned and taxed whole, and
every such pension is fed nothing but the floor under its salary's match. All of
them or none, rather than a share of each or the lines that fit, since a
sacrifice a month cannot afford is a draw by another name, and the pension would
be fed in the very month the savings are sold to cover the spending. A salary
feeding a pension kept paid sacrifices on the terms under Pensions kept paid.

The share of the match the sacrifice earns lands with the sacrifice or not at
all. The floor is paid whatever is given up, so in a month a sacrifice is
dropped the floor under its match lands all the same, since it costs the
household nothing, and counts against the allowance as it does in any month.

## The tax on the month

The income is taxed as the UK outside Scotland taxes it for 2026/27, the rates
held in `src/lib/tax.ts`. Tax is charged on a person and not a household, so
each owner's lines are taxed together against their own personal allowance,
bands and thresholds and apart from everyone else's: two salaries of £40,000 pay
two people's tax rather than one person's on £80,000. The month's figures are
the owners' summed.

Income tax is charged on every kind of line, with the personal allowance
withdrawn a pound for every two over £100,000. National Insurance is Class 1 on
a salary and Class 4 on self-employed profit, and none on a pension, the State
Pension among them, or on other income.

Each month is taxed as a twelfth of a year, against a twelfth of each band as
the bands stand in its tax year. That is the year's tax exactly when the year's
months are alike, and too much or too little when they are not, as in the year a
salary stops: a month earning more than the rest meets a twelfth of each band
that the quieter months leave unused, and a month read past the band where the
personal allowance is withdrawn is charged 45% on pay its year is charged 60%
on, so the year can owe. So the run carries each owner's tax year, April to
April, what its months were taxed on and what they were charged. In the April
after, each owner's year is worked out whole: their income tax on everything
their months earned and drew from their pensions, and their Class 4 on all their
profit, each against as much of each band as the months the plan held of the
year, as the bands stood that year. What that comes to less what the months paid
is refunded into April's money or owed out of it, every owner's together, since
the month's money is the household's. It comes in as income does, untaxed, and
is spent, saved or drawn for with the rest. Class 4 is settled with the income
tax since it too is due on the year's profit rather than a month's; Class 1 is
charged a pay period at a time, as the months charge it, and is not settled. The
plan's first tax year is the months of it the plan holds, against their share of
each band, and its last is cut off where the plan ends and never settled. A
month read on its own settles nothing.

The bands are frozen until April 2031 and are held so: flat in pounds through
the 2030/31 tax year, so an income rising with prices is dragged into a higher
band as it would be, and rising with prices each April from 2031/32, at the
plan's inflation or along the path of a future of the markets, every band
together, as the law raises them once the freeze ends, so each tax year is
charged and settled against its own. The National Insurance thresholds follow
them. The £100,000 the personal allowance is withdrawn over is held as a band
and rises with them.

## Debts

A debt's own fixed sum is a loan's payments, so it runs only until the loan
maths in `src/lib/loans.ts` says they clear what is owed: the term the payment
takes to pay the balance down, to the balloon a PCP leaves standing, at the rate
the debt is charged, its own fixed one or the plan's own, under The run, counted
from the month the plan starts in. Nothing is charged after the month the last
payment falls in. A debt's own fixed sum has an end, always: charged for every
month of the plan instead, a £5,000 card at £250 a month costs £90,000 over
thirty years, and the money it would have saved after the second is never saved.
In the last month only what the payments have left to pay is charged, what is
owed with the month's interest less any balloon a PCP leaves standing, since the
term is rounded up to a whole month and the last payment is more than is left; a
lender takes what is owed rather than the payment whole, and the rest is the
month's to save.

A month of a debt charges interest at a twelfth of the yearly rate on what is
owed as it opens and takes the month's payment off it, as the loan maths reads a
month, and pays it down no further than nothing. A month that pays a debt
nothing charges it nothing, which holds a balloon where the payments leave it,
and a debt that nothing pays where it opened, for the rest of the plan: interest
on a sum nobody pays would compound it for a lifetime, which no plan carries.

A debt whose payments an expense line carries is left out of the fixed sums, the
line being the payment, so the loan is counted once, as the line, and stops when
the line does. The line is charged the same way in the month it clears the loan.
When it runs is the loan's to say, not the line's: whenever the household is
read, the line runs from the plan's first year to the month the same loan maths
clears the loan in, worked out over the whole balance with a PCP's balloon
refinanced on the same terms, or to the end of the plan when it never clears, as
an interest-only mortgage does. So a mortgage's end moves with the balances'
month as a plain debt's does, and only a fixed sum leaves a balloon standing.
The household refuses a line naming a loan it does not list, and removing a loan
removes the line paying it; a month handed one anyway pays nothing off it.

Saving a debt whose fixed payment never clears it is refused, since a payment
the month's interest swallows gives the run no month to stop at, and the engine
refuses one that reaches it. A debt paid its own sum owes more than its balloon,
and a line paying a debt pays something, since either otherwise leaves the debt
standing as it is for the whole plan, paid nothing and charged nothing.

## Pensions kept paid

A pension is kept paid when the month cannot pay it, unless it is marked
droppable, since what it is paid out of taxed money is relieved, and a pension
an ISA is sold to keep paid holds more than the ISA did. Only a pension may be
marked droppable.

A pension kept paid is paid its fixed sum after the debts and before every other
saving's; one paid the spare money takes it in the order it is listed, as any
account does. Its salaries' sacrifice still comes off before the tax, as every
sacrifice does, but is given up, and the pension's own fixed sum paid, out of
what the month has and then out of the cash, the GIAs and the ISAs, once they
have met whatever spending and debts' payments the month is short of. The
salaries feeding it sacrifice together or not at all, as the rest do, but
whatever the month has, so long as the cash, the GIAs and the ISAs hold what the
month is then short of, to within a nanopound: the month is short by what they
gave up too, for the run to draw. A month read on its own is taken to have
savings enough.

It is never paid out of a pension, since one pension sold to pay another is
money going round in a circle, charged 55% before the pension age. Once the
cash, the GIAs and the ISAs are spent it is paid only what the month has, as any
other saving is. What keeping it paid adds to a month's shortfall is drawn after
the spending, under The draw, out of the cash, then the GIAs, then the ISAs,
under every drawdown: drawn before the spending, it would push the spending on
into a pension the drawdown had not yet reached.

The month keeps a pension paid only as far as the cash, the GIAs and the ISAs
would hold it once the spending the month is short of had come out of them too,
whichever accounts the drawdown draws that spending from, since the month cannot
see what the drawdown leaves in them; so under a drawdown drawing a pension for
the spending, a pension is kept paid less than the savings could have paid it,
or not at all.

A pension marked droppable is paid out of what the month has alone, in the order
it is listed, as any other saving is, and its salaries sacrifice as under
Salaries and what they feed.

So a month that is short feeds nothing but the pensions kept paid and the
floors, pays no fixed sum but a debt's and such a pension's, and hands over no
spare money. A pension kept paid is the one saving the household pays, or feeds
beside the employers' floors, in a month the savings are drawn on.

## The allowances and relief

Each owner has one ISA allowance and one pension allowance, each shared across
every account of the kind they hold. Their ISAs are held together to what the
tax year has left of the £20,000 ISA allowance in what lands in them, and their
pensions to what it has left of their pension allowance, from every source in
the order the month pays them: what the salaries feed, then the fixed sums of
the pensions kept paid, then the other fixed sums in the order the accounts are
listed, then the spare money's takes in the same order, each taking only what
the ones before it left. A sacrifice the month does not give up takes none of
it, and its floor only what lands, so what a pension kept paid is fed in a month
short of the rest does not hang on which salary is listed first. A cap typed on
an account paid the spare money only lowers what it takes, held a twelfth a
month less what a salary already feeds it that month.

The run carries what each tax year has used of each allowance from April, so a
bonus month fills what the months before it left, and a month short of spare
money leaves its share to the months after it. The months of the plan's first
tax year before it opens hold nothing the run paid, and are taken to have used a
twelfth each, since the household has part-spent that year already, rather than
leave the months left of it the whole year's room. A month read on its own
carries nothing and opens each allowance at a twelfth of the year's, the room a
month has at an even pace: it knows nothing of the months either side of it, and
opened at what is left of the year instead, a month read in April would open the
whole year's room in one month.

A fixed sum or the spare money past the room is not paid, since each is a
payment the plan chooses rather than one it owes, and stays in the month to pay
the sums and the spare money after it. A fixed sum that alone is past its kind's
allowance in a year is refused when it is saved: £20,000 into an ISA, and
£48,000 into a pension, which lands as the whole £60,000 once the basic rate is
claimed back. What a salary feeds, the sacrifice with its NI and the match,
lands whole, since it is the employer's contribution under the scheme. What
lands in an owner's pensions past the room is the annual allowance charge: it is
added to the owner's taxable income for the month, charged through their bands
at their marginal rate, and settled with the tax year as the rest of their
income tax is. It is no earnings, so the National Insurance leaves it out.

The pension allowance is £60,000, tapered by a pound for every two of adjusted
income over £260,000, to a floor of £10,000, for an owner whose threshold income
is over £200,000 as well. Both incomes are read off what the owner's lines
running in the month pay in a year, not off a month's pay, so a bonus paid in
one month is counted once rather than twelve times over: the adjusted income is
that pay after the sacrifice with what the salaries land in the pension on top,
and the threshold income is that pay with the sacrifice counted back in. What is
paid into a pension out of taxed money is not taken off the threshold income, so
an owner within those payments of £200,000 is tapered a little early. Once an
owner has drawn on a pension as income, a flexible access, their pension
allowance is the money purchase one, £10,000, from the month after for the rest
of the plan, whatever their incomes, and what the tax year has landed already
counts against it, so an owner who paid £10,000 in before the draw has no room
left that year and every pound a salary feeds after it is charged; a draw before
the pension age is an unauthorised payment rather than an access, and does not
do that.

A fixed sum or the spare money paid into a pension comes out of taxed money
instead, so the pension claims the basic rate back on it, and £800 paid lands as
£1,000, which is what a pension's cap and its allowance are held to. The relief
a higher rate taxpayer claims on top is theirs rather than the pension's, and is
not counted. Relief is claimed on no more than the owner earns a year from their
own salary or self-employment, less what they sacrifice, or £3,600 when that is
more, a twelfth of it a month shared across the owner's pensions in the order
the month pays them; a pound paid past it lands as a pound. So a pension paid
after its owner retires, or one of an owner who earns nothing whatever the rest
of the household earns, lands a pound for a pound once £300 has landed in the
month.

## The run

A run is the plan's years, a point to each year to the plan's horizon, each the
balances entering that year: the first point is the balances as they are, and
each after it the year before carried to its end, a month at a time. The first
year runs from the month after the one the household's balances are as of, since
a balance is what an account held at that month's end, as a statement is dated
and as each progress point is read, so the plan pays nothing into a month the
statements already hold, whatever day the plan is read on; a household read
before anything is saved opens as of the month before the one it is read in, so
its plan starts in that one, and keeps the month from its first save. The last
year is not carried at all, since no point follows it.

Each month, what an account is paid lands at the start of it, and the balance
then grows a month at its rate. What it is paid is what that month's cash flow
says, read afresh each month, since a line may end in one, and read over every
account, since a fixed sum into any of them is money the month no longer has and
a pension not listed would be fed nothing.

An account grows at a fixed rate of its own or at the plan rate. The plan rate
is made from the rates live, one to a class, either those typed or those derived
from the capital market assumptions: what stocks return in all, their growth and
the dividend yield on top, which every account reinvests, and what bonds return,
each in the share of the savings the split holds in it, typed or the target
allocation's; under the derived set it also earns what rebalancing adds over
that blend, as `rebalancingOf` in `src/data/cma.ts` works it out. Under the
derived set, bonds return what the target allocation's bond categories blend to,
and where it asks nothing of bonds, what the vintage expects of global bonds
hedged to sterling, or unhedged where it prices no hedged form: an allocation
all in equities can still sit under a glide path that holds bonds in later
years, and those years need a return and a risk that the allocation cannot give.
A glide path moves the split with the plan's owner's age, so a plan on one
carries the plan rate year by year, each year's at the split the path holds at
the age reached in it, and its own rate is its first year's. Along a glide path
or a future of the markets, a saving or an asset on the plan rate takes the
year's rate. An account on a fixed rate keeps its own, and so does a debt on the
plan rate, since its payment and the term it clears in are worked out against
the plan's own rate, and charged at another it would be left owing when the
payments stop.

Each account is carried on its own, and the point sums the wrappers as well.
Cash and the GIAs are carried beside the wrappers, so a short month can be drawn
from them. A house, a car or another real asset is carried as a saving is, paid
what the flow pays it and grown at its own rate, below nothing for one that
loses value, held to its limit, and is never drawn on: the plan sells nothing it
lives in or drives to cover a month. A debt is carried apart, owing, paid down a
month at a time by what the flow pays off it, under Debts, and is never drawn on
either.

From month to month the run carries what a month cannot read afresh: each
owner's lump sum allowance left, under The draw; the owners who have drawn on a
pension as income and what has landed under each allowance since April, under
The allowances and relief; and each owner's tax year, under The tax on the
month, which the draw reads as well, under The draw.

What no account covered is the year's uncovered shortfall, summed over its
months and carried on the point the year's balances are read off, so the
balances entering a year and what went uncovered during it are read together and
the run can say when the money runs out; beside it is what the year drew out of
a pension before the pension age, to be marked rather than counted on. A year
with either is short, and the plan falls short in the first such year.

## Moves

A house may move once, at a milestone the household lists, reached at an age. A
move sells the home as its milestone's year opens and buys the next at its price
risen at the house's own growth to the month and held to the move's ceiling, to
which the house is held from then, putting everything the sale leaves into the
purchase, borrowing the rest up to the move's loan to value, and charging the
stamp duty a home mover in England pays. The mortgage a move takes out is paid
by a line from the January the move is made in, and the loan maths counts its
term from then. A move borrows only on a loan already secured on the house, so a
home owned outright today buys the next out of the sale and the savings alone.

A house moving in a year is moved as the year opens, after its point is read and
before the plan's owner's retirement is, so the year is measured as it will be
carried, on the balances as the move leaves them. What the sale leaves over
lands in the first cash account, and in a household with none is counted
nowhere; what it leaves short is taken out of the year's first month as a
settlement is, as money that month no longer has, so that month pays the savings
only what is left after it, and a pension kept paid as Pensions kept paid says,
and draws what it leaves short as any shortfall is drawn.

## Retirement on conditions

The plan's owner may retire when conditions hold rather than at an age, and
nobody else may. Which year that is depends on how the run has gone, so the run
retires them in the first year whose opening holds the conditions, read off the
balances entering it as its point has them, or as a move that year leaves them,
and a year's expenses as they would be were the owner to retire then. Until then
they earn, a line starting at retirement has not started and one ending at it
runs on, and from then the year is carried as a plan retiring at the age they
reach in it.

Another owner may still retire with the plan's owner rather than at an age of
their own, as a household retiring together does, and then retires at
Retirement, whatever it is reached on. So where it is reached when conditions
hold they earn until the run retires the plan's owner, and stop in that year
too. The plan's owner cannot retire with themselves, since Retirement is theirs.

## The draw

A month the income does not cover is drawn out of the savings at the start of
it, before the month's growth, as a payment lands, so what leaves earns nothing
for the month it is gone. It is drawn in two parts: first what the spending and
the debts' payments are short of, in the order the plan's drawdown names, and
then what keeping the pensions paid adds to it, under Pensions kept paid.

The plan names one of five drawdowns, and a plan naming none draws its savings
first:

| Drawdown                          | Order                                                     |
| --------------------------------- | --------------------------------------------------------- |
| Savings first                     | cash, the GIA, the ISA, the pension                       |
| Pension before the ISA            | cash, the GIA, the pension, the ISA                       |
| Pension first                     | the pension, cash, the GIA, the ISA                       |
| Pension to the basic rate band    | the pension to the basic rate band, then savings first    |
| Pension to the personal allowance | the pension to the personal allowance, then savings first |

Savings first takes cash first, since it is spent as it stands and grows least;
then the GIA, since what it earns is taxed and what an ISA earns is not, though
the plan charges a GIA nothing; then the ISA, which is reached at any age and
owes nothing on the way out; then the pension. Pension before the ISA takes the
pension after the GIA and ahead of the ISA, so what it gives up as income fills
its owner's personal allowance and lower bands in the years before the ISA would
have run out, which can pay less tax over a life. Pension first takes it ahead
of the cash as well. Within a kind the accounts are drawn in the order they are
listed, each giving up what it holds or what the month is still short, whichever
is the lesser, so an account is drawn to nothing and no lower and what it could
not cover passes to the next.

Pension to the basic rate band draws the pensions first, but only into the bands
charged at no more than the basic rate and only as far as the month is short,
and draws what is left as savings first does. A pension drawn as income is taxed
nothing within its owner's personal allowance and 20% within the basic rate
band, and a year's bands left empty are lost with the year, while a pension left
whole until the savings run out is drawn later, beside the State Pension and in
larger sums, into the higher rates; so filling them in the years the savings are
drawn can pay less tax over a life. Every owner's personal allowance is filled
before any owner's basic rate band, since a pound drawn at 20% into one owner's
band while another's allowance stands empty is a pound the household could have
had free of tax. Within each, the owner taxed on least so far in the tax year
goes first, read to the penny so that a residue of the arithmetic cannot break a
tie, a tie going in the order the household lists its owners, and an owner's
pensions are drawn in the order they are listed. An owner with a salary or a
self-employed profit running in the month is passed over, since a draw as income
holds what is paid into their pensions to the money purchase allowance from then
on, and a working owner's pensions are the ones still being paid into. A salary
or a profit stops in the year its owner retires, so the plan's owner retiring on
conditions, and anyone retiring with them, is filled from the year the run
retires them. What the fill draws, less its tax, is no more than the month is
short, since the draw only takes money out and what it drew past need would have
nowhere to land, and the reason to draw past it, the inheritance tax a pension
is charged from April 2027, is not modelled. Pension to the personal allowance
fills the allowances alone and no band, so a pension is drawn ahead of the
savings only where it is taxed nothing, for a household that would rather keep
the pension than pay 20% to draw it sooner.

The room left in a band is measured over the tax year so far, as April settles
the year, rather than as a fresh twelfth each month: the share of the band for
the months the plan has held of the year, this one among them, less everything
the owner has been taxed on in them, this month's income and draws included. So
a year whose salary stopped part-way, having used the band already, fills
nothing until the months catch it up, rather than drawing at 20% what April
charges at 40%; and a month after one that drew less than its share catches up,
charged as a twelfth of a year as every month is, which is too much, and
refunded the excess in April, as a bonus month is. Income later in the tax year,
such as a State Pension starting in January, is not foreseen, so a band filled
before it starts is overfilled once it does, and April charges what is over. The
room is what may be taxed, so while the owner's lump sum allowance lasts the
draw is a third more than the room, a quarter of it being free, and a pound for
a pound once the allowance is used up, exactly where it runs out part-way
through a draw. Room of less than a penny is none, since a draw on a pension
marks its owner as having drawn on one as income, which holds what is paid into
their pensions to the money purchase allowance from then on, and the residue of
the arithmetic, or a few pence, is no reason to.

A pension is drawn as income, where its kind falls in the order, from its
owner's pension age: from the year the owner the pension belongs to turns 55
until the age rises in April 2028, taken from the start of that April, and from
the year they turn 57 after it, read off each owner's own year of birth. Someone
who is 55 or 56 when it rises can draw before it and not again until 57. Before
its owner's pension age, under every drawdown, a pension fills no band and is
drawn only after every pension drawable as income has given up all it holds and
once cash, the GIA and the ISA are empty, as the last thing between the month
and running out, and at the 55% charge on a payment the rules do not allow, 45p
kept of each pound, since the money can be had that way and at no other. A
registered scheme will not normally make one, so the run marks such a draw
rather than counting on it, under The run.

Cash, the GIA and the ISA give up what the month is short, a GIA charged no tax
on what its draw realises. A pension is taxed on the way out, as its owner's
income, so its draw is grossed up so that what is left of it once taxed is what
the month is short. A quarter of each draw is free of tax until its owner's
£268,275 lump sum allowance is used up over the plan, one allowance each, and
the rest is taxed as income on top of what its owner earned in the month and
drew from their other pensions before it. So a second pension of one owner's in
the same month is taxed from where the first left off, and another owner's is
drawn under their own allowance and bands, from where their own income stands. A
pension holding less than that gives up all it holds and covers what that leaves
once taxed. What a draw is taxed on joins its owner's tax year, under The tax on
the month.

What the last account leaves is uncovered: the plan is short by it, and the run
says so rather than lending it, under The run.

## Today's money

The engine works in the pounds of each month and reads out in today's money, the
money of the month the plan starts in. Prices rise from there at the plan's
inflation, or along the path of a future of the markets where the run is carried
along one. A line states its amount in today's money, and is paid it risen from
there a month at a time at the rate its growth gives: the plan's inflation, a
point or two over it, or nothing for a line fixed in nominal terms. A loan's
payments are always fixed so, whatever the line was saved with, since the loan
maths reads one payment for the whole term.

Everything an account states is in the pounds of the day, as a statement or an
agreement gives it: its balance, its fixed sum, its cap and its rate, the plan
rate among them, which is a nominal return. So are the figures the law sets and
does not raise: the ISA and pension allowances, the lump sum allowance, the
£3,600 of relief and the stamp duty bands. Held so, an allowance shrinks in
today's money over a plan of decades as prices rise, as it would if no
government changed it again. The tax bands are held flat in pounds until their
freeze ends, under The tax on the month.

A point divides every balance by how far prices have risen by the start of its
year, and what the year went short or drew early by, a month at a time, by how
far they had risen by that month, so a balance that keeps pace with prices reads
level. A month read on its own is read the same way, so a line rising with
inflation reads at what it states in whichever year is read, and what an account
is paid reads at what it is worth then; the cap it is paid to is a limit, read
as it is stated, as the line is.

A house's ceiling and a car's floor are stated in today's money, as a line is,
since what a house tops out at or a car is scrapped for rises with every other
price: the engine holds the asset to its limit risen to the month, so one held
there reads at it on every point.

## What a point is worth

The net worth and the liquid net worth count a pension as drawn at the basic
rate, which is what a draw beside the State Pension mostly meets: a quarter free
of tax as far as its owner's lump sum allowance left reaches, one allowance
across all of the owner's pensions, what they leave shared between them by what
each holds, and the rest taxed at 20%. Each point carries what is left of each
owner's allowance in today's money, as it carries the balances, though the law
holds the allowance in nominal pounds, so the quarter is capped against like
money.

The liquid net worth is the net worth less every real asset, the property and
vehicles among them, and less every pension in a year its owner cannot draw it
all through, the pension age read as it stands at the year's end, so its rise to
57 in April 2028 does not count a pension for 2028 alone; from that age it
counts at the same figure. The net worth counts a pension all along, and not at
the 55% a draw before that age is charged, since what the household owns is not
what it can have this month.

A condition setting the net worth or the liquid net worth against a year's
expenses, either way round, adds back what is owed on every loan an expense line
running that year pays. Both worths take every debt off, and the expenses count
the line paying a loan, so set against each other they would count the loan
twice, as its balance and again as a multiple of its payments, and the multiple
typed would ask for more than it says. Counted once it is counted as the
payments, which carry its interest where the balance does not. A debt paid its
own fixed sum is no expense line, so it is counted once already, as the balance.
Set against pounds or the debt, a worth is read as measured, since nothing there
counts the loan a second time.

## What is refused, and where

A household that breaks a rule is refused where it is saved, by the rules in
`src/data/household.ts` and the actions, so the engine is never handed one by
the store. The engine refuses one that reaches it anyway wherever running on
would give a figure nobody can read, which only a caller that skipped the model
could hand it. The month refuses what it reads, and the run what it carries. A
rule the engine runs soundly past is the store's alone: a rate above 50%, a debt
paid its own sum owing no more than its balloon, and a line paying a debt
nothing. Where both hold a rule its words are kept once, in `src/data/rules.ts`,
so a refusal read off either is the one rule.

The links between lines and accounts are read over the whole schedule before any
month is worked out, since a link is wrong the day it is written rather than the
year its line starts in: checked only where its line runs, it would be refused
part way through a run while a month read on its own stayed green. An income
line is earned by an owner the plan lists, since there are otherwise no years to
tax it by or stop it at. A salary feeds a pension alone, and an expense line
pays a debt alone, since a sacrifice would otherwise leave the salary and land
in no wrapper, and a line paying any other account would drop the sum that
account states and pay it nowhere. A line naming an account the plan does not
list names nothing to the engine and is sound there, though the household
refuses it. A salary gives up a share of its base, since a share below nothing
would feed the pension less than nothing and pay the salary more than it earns,
and a share past the whole would give up pay the salary never paid. Its employer
matches a share of the base, since a match below nothing would take back out of
the pension what the sacrifice put in, and its employer's minimum is a share of
the base. A real asset or a debt takes no spare money, since with no allowance
to cap it it would take everything.

An account is listed once, since the store hands out an id an account, and
listed twice an account is paid its fixed sum twice over in every month, takes
the spare money twice on the way down, and has its balance counted twice in
every year. The run refuses it as well as the month, so a plan of no years,
which reads no month, is refused all the same. An ISA or a pension belongs to an
owner, since an allowance with nobody to hold it to is a figure the month cannot
place, and nothing else does; read as a number rather than as present, so an
owner of null is refused rather than pooling every such wrapper into one
allowance; and it belongs to an owner the household lists, since there is
otherwise no age to draw it at and no allowance to draw it under, read before
any month as the links are rather than in the first month a draw reaches it. The
engine refuses as well what the sections above refuse where it is saved: a
droppable mark on anything but a pension, under Pensions kept paid; conditions
on anyone but the plan's owner, and a move borrowing on a house no loan is
secured on, under Moves and Retirement on conditions.

A balance below nothing is a debt's: a wrapper, a GIA, a cash account or an
asset below nothing is a figure nothing can mean, compounded deeper every month
by the growth and never drawn on. A debt's balance is nothing or less, since
above nothing it would read as money held on the first point and be wiped off by
its first payment. So are the debts refused under Debts.

A rate loses no more than everything: at minus one a balance is nothing from the
first month on, which is a rate that can be meant, and below it every balance
after it is no number at all. A rate typed for the plan, a class's return, its
dividend yield or inflation, is no more than 50% a year either, and nor is any
class return a vintage keeps, since a return outside that is no reading of any
market and a figure past it is a percentage typed as a fraction; an account's
own fixed rate is held only to losing no more than everything. Inflation is a
rate, and prices fall by less than everything, since no amount can otherwise be
read in today's money and every figure after the plan's first month would be no
number at all; an inflation that is no finite number is refused for the same
reason.

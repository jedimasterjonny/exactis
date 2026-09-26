# TODO

Gaps in the engine's model, found by review. Each is a decision about the model
as a whole, to be closed in the general case rather than patched where it was
noticed. None is small.

## Growth

A line's growth choice is stored and shown and never read: every line is taken
flat, in today's money, for the whole plan. Decide the inflation assumption the
plan carries, then apply each line's growth against it, so a salary rising with
inflation is flat in real terms, a nominal payment falls, and the triple lock
rises.

## Allowances

Each owner has one ISA and one pension allowance, shared across their accounts
of the kind. What a salary feeds, a fixed sum and the spare money all count
against it, a typed cap only lowers it, and money past it is not paid, staying
in the month for the accounts after it; what none of them takes is spent. A
fixed sum that alone is past it is refused when it is saved. It is held a
twelfth a month rather than across the tax year, so a month short of spare money
loses its twelfth for good, and a sum paid once a year is spread as if paid
monthly.

What the law adds on top is not held. There is no taper above £260,000 of
adjusted income, no carry-forward of the three years before, and no money
purchase annual allowance, although the engine draws on a pension and a draw
would cut the allowance to £10,000. Money past the pension allowance is simply
not paid, where a sacrifice past it would really be paid in and charged at the
owner's marginal rate. And the ISA allowance is one figure, with no Lifetime ISA
held to £4,000 within it.

Decide whether the allowance is held across the tax year rather than a month at
a time, which would have the projection carry it as it carries the tax year; the
rest are figures to add as the plan needs them.

## Owners

An ISA or a pension belongs to an owner, and nothing else in the plan knows
whose it is. Income lines name no owner, so every salary is taxed together, as
one person's income against one set of bands, and a salary may sacrifice into
another owner's pension. The plan holds one year of birth, so every pension is
drawn from the one pension age, as though all the owners were born in the same
year, and one lump sum allowance is shared by all of them. It holds one
retirement age too, so every salary and every self-employed line stops in the
same year, whoever earns it, and the plan screen still draws each such line to
its own last year where the engine stops it at retirement. A draw on one owner's
pension is taxed on top of every other owner's earnings, and each owner's
pensions are relieved on everyone's earnings, as though each owner earned them
all.

Decide whose each income line is, and the year each owner was born and retires,
so tax, the pension age, the lump sum allowance, the earnings relief is held to
and the last working year are each a person's rather than the plan's, and a
salary feeds only its own owner's pension.

## Today's money

Lines are in today's money, a fixed account rate is hinted as nominal, and the
plan rate states no basis. Decide one basis for the whole projection, state it,
and deflate or inflate whatever is entered on the other.

## Tax

The month's income pays income tax and the employee's NI, a pension draw is
grossed up for its tax and each tax year is settled in the April after it, so
what is spare is after tax. What a pension is worth is not: the chart sums a
pension and an ISA as if worth the same, the pension gross of what taking it out
would cost. And the draw order is the one that was right before tax, cash, then
the ISA, then the pension, where filling the personal allowance from the pension
before the ISA is touched pays less over a life; with draws taxed, the engine
can now weigh the two, and does not.

Smaller gaps sit beside those. The employer's NI is credited at the full rate on
the whole sacrifice, ignoring the threshold and what the scheme passes on, and
from April 2029 a sacrifice over £2,000 a year pays both NIs. A pension paid out
of taxed money claims the basic rate and not the higher rate a taxpayer claims
back through a return; nor does its gross come off the income the personal
allowance is withdrawn against, which between £100,000 and £125,140 is worth
another 20%; and it claims relief after 75, when relief stops. The employee's NI
runs past the State Pension age, when it stops, and a bonus is spread over the
year as the line pays it, where paid in one month most of it would meet the 2%
rate. Cash interest is not taxed. The bands are those outside Scotland, and are
held flat in today's money, so in effect they rise with prices where the freeze
to April 2031 holds them and drags income into higher bands. A draw before the
pension age is charged a flat 55% however small against the pension, and the
lump sum allowance is taken to be whole when the plan opens. The pension age is
read off the year its owner was born and not the day, so the whole of the year
an age is reached counts as reaching it, and a protected pension age some
schemes give is not held. A refund a month has no account to take goes where any
money the month leaves goes, which is nowhere the projection counts.

Decide what a pension is worth beside an ISA once the tax on taking it out is
counted, and the order the plan draws in, so the projection's two lines and its
drawdown are both after tax; the smaller gaps are figures to add as the plan
needs them.

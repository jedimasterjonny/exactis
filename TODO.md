# TODO

Gaps in the engine's model, found by review. Each is a decision about the model
as a whole, to be closed in the general case rather than patched where it was
noticed. None is small.

## Allowances

What holds is under The allowances and relief and Today's money in
[`src/engine/README.md`](src/engine/README.md): each allowance is held across
the tax year, but a typed cap is still held a twelfth a month, so an account
capped below the allowance never catches up a month that went short, and a fixed
sum stated a year is spread as if paid monthly.

What the law adds on top is not all held. There is no carry-forward of the three
years before, so the money purchase allowance's loss of it is moot. The taper
reads threshold income without taking off what is paid into a pension out of
taxed money, and adjusted income without a draw on a pension in the month. And
the ISA allowance is one figure, with no Lifetime ISA held to £4,000 within it.
The money purchase allowance counts what the tax year landed before the draw,
where the law tests it only against what is paid in after.

Decide whether a cap is held across the tax year as the allowance is; the rest
are figures to add as the plan needs them.

## Tax

What holds is under The tax on the month, The draw and What a point is worth in
[`src/engine/README.md`](src/engine/README.md). A drawdown filling the bands
from the pensions draws no further than a month is short, so a month with money
to spare leaves the bands unused, and nothing counts the inheritance tax on a
pension that would make drawing past need pay.

Smaller gaps sit beside it. The employer's NI is credited at the full rate on
the whole sacrifice, ignoring the threshold and what the scheme passes on, and
from April 2029 a sacrifice over £2,000 a year pays both NIs. A pension paid out
of taxed money claims the basic rate and not the higher rate a taxpayer claims
back through a return; nor does its gross come off the income the personal
allowance is withdrawn against, which between £100,000 and £125,140 is worth
another 20%; and it claims relief after 75, when relief stops. The employee's NI
runs past the State Pension age, when it stops. Cash interest is not taxed, and
nor is a GIA: neither the dividends it is paid each year nor the gain a draw
realises, which would need what it cost held beside what it is worth, and an
owner for the allowances and bands it is charged under. The bands are those
outside Scotland. From April 2031 every band rises with prices together, where
the law raises the personal allowance and the basic rate band and leaves the
£100,000 the allowance is withdrawn from where it is. A draw before the pension
age is charged a flat 55% however small against the pension, and the lump sum
allowance is taken to be whole when the plan opens. The month keeps a pension
paid only as far as the savings cover the spending and the kept payment
together, where a drawdown drawing the pension for the spending leaves the
savings for the kept payment alone. The pension age is read off the year its
owner was born and not the day, so the whole of the year an age is reached
counts as reaching it, and a protected pension age some schemes give is not
held. The pension ages are constants in the engine until the assumptions screen
sets them. A refund a month has no account to take goes where any money the
month leaves goes, which is nowhere the projection counts. What a pension is
worth is counted at the basic rate on the three quarters taxed, where a draw
meets the rate of the year it is taken in beside what else is earned then. A
progress point's pensions are read gross, as the sheet summed them, since a
point pools pensions without owners.

The smaller gaps are figures to add as the plan needs them.

## Debt

What holds is under Debts in [`src/engine/README.md`](src/engine/README.md). A
PCP paid its own fixed sum leaves its balloon standing, and nothing in the plan
pays it: the projection holds it where the payments left it, charged nothing,
for the rest of the plan. A debt that nothing pays is held where it opened the
same way. In life a balloon is paid, refinanced or settled by handing the car
back, and each of those moves the savings, the car or both.

Decide what the plan does with a balloon when the payments end, and whether a
debt nothing pays is charged its rate, so every debt the plan carries ends the
way the model says it does.

## Moves

What a move does is under Moves in
[`src/engine/README.md`](src/engine/README.md): it charges the stamp duty a home
mover in England pays. Nothing else a move costs is charged: no agent's or
solicitor's fees, no survey or removals, and no early repayment charge on a
fixed rate the sale clears. What the sale leaves over lands in the first cash
account, and in a household with none it is counted nowhere. A move is at a
milestone reached at an age, a house moves once, and a move borrows only on a
loan already secured on the house, so a home owned outright today buys the next
out of the sale and the savings alone.

Decide whether a move charges its costs, as a share of each price or a sum
typed, and whether a house may move more than once, downsizing after a move up;
the rest are limits to lift as a plan needs them.

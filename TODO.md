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

The ISA and pension allowances are applied per account, so two of a kind get two
allowances; a typed cap replaces the allowance rather than tightening it; a
fixed sum and a salary sacrifice are never held to it; and there is no taper,
MPAA or carry-forward. Decide the allowance as a per-person figure across every
account of the kind, what counts against it, and what happens to money past it.

## Today's money

Lines are in today's money, a fixed account rate is hinted as nominal, and the
plan rate states no basis. Decide one basis for the whole projection, state it,
and deflate or inflate whatever is entered on the other.

## Tax

Nothing is taxed. Left over is gross, so every spare-money account is
over-funded by the tax bill; a sacrifice is charged at its full cost, so its
employee saving is zero; the employer's NI is credited at the full rate on the
whole sacrifice, ignoring the threshold and what the scheme passes on; and a
pension and an ISA are summed as if worth the same. Drawing down needs it too: a
pension draw is taxable income where an ISA's is not, so a tax year, April to
April, has to sum the pension draws falling in it, which the engine can only do
by keeping what each month drew rather than the balances a draw leaves behind,
and a draw on a pension has to be grossed up so that what survives the tax is
what the month was short by. The tax-efficient order, filling the personal
allowance from the pension before the ISA is touched, is a second way of drawing
down that waits on the same answer. Decide the tax the plan takes, income tax
and both NIs, and where it comes off, so what is spare and what a pension is
worth are both after it.

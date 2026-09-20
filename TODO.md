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

## Drawdown

Nothing is ever drawn out. A month that does not cover its outgoings is computed
and then dropped, so a plan that runs out plots wrappers that keep compounding,
and a fixed contribution goes on being paid after the income funding it has
ended. Decide where a shortfall is drawn from and in what order, so the
projection can say when the money runs out.

## Today's money

Lines are in today's money, a fixed account rate is hinted as nominal, and the
plan rate states no basis. Decide one basis for the whole projection, state it,
and deflate or inflate whatever is entered on the other.

## Tax

Nothing is taxed. Left over is gross, so every spare-money account is
over-funded by the tax bill; a sacrifice is charged at its full cost, so its
employee saving is zero; the employer's NI is credited at the full rate on the
whole sacrifice, ignoring the threshold and what the scheme passes on; and a
pension and an ISA are summed as if worth the same. Decide the tax the plan
takes, income tax and both NIs, and where it comes off, so what is spare and
what a pension is worth are both after it.

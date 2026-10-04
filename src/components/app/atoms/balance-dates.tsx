import type { JSX } from "react";

import type { Account } from "@/data/accounts";

import { balanceGroups } from "@/data/accounts";
import { formatDated } from "@/lib/months";

interface BalanceDatesProps {
  readonly accounts: readonly Account[];
  readonly today: string;
}

// How fresh the balances are, in one strip, as the assumptions screen
// says how fresh its sources are: for each group, the day its balances
// were set and how old that is, or the oldest of them when they were set
// on different days, since a group is only as fresh as its stalest
// balance. A group with a balance never dated says so, since an undated
// balance is older than any day it could be given, and a group holding
// nothing says that. The strip says how old each is rather than judging
// whether that is too old, since a house is valued yearly and an ISA
// monthly and the reader knows which. The day it is is given rather than
// read, so the strip draws the same on the server as in a test.
export function BalanceDates({
  accounts,
  today,
}: BalanceDatesProps): JSX.Element {
  return (
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
      {balanceGroups.map(({ holds, name }) => (
        <div className="grid gap-1" key={name}>
          <dt className="label text-muted-foreground">{name}</dt>
          <dd>{freshnessOf(accounts.filter(holds), today)}</dd>
        </div>
      ))}
    </dl>
  );
}

// What the strip says of a group's balances: nothing held, not dated, or
// the day they were set, the oldest of them where they differ.
function freshnessOf(held: readonly Account[], today: string): string {
  if (held.length === 0) {
    return "None held";
  }
  const dated = held.flatMap(({ setOn }) =>
    setOn === undefined ? [] : [setOn],
  );
  if (dated.length < held.length) {
    return "Not dated";
  }
  // No balance is set after today, so the oldest is found from it.
  const oldest = dated.reduce(
    (day, other) => (other < day ? other : day),
    today,
  );
  const said = dated.every((day) => day === oldest) ? "Set" : "Oldest set";
  return `${said} ${formatDated(oldest, today)}`;
}

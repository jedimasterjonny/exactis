import type { Account, AccountKind } from "@/data/accounts";

import { holds } from "@/data/progress";

// One column of the sheet: its heading, and what the row holds under it.
type Column = readonly [heading: string, value: string];

// The owner's balances sheet is laid out in groups, each set off by an
// empty column: the accounts it holds, what is held before what is
// owed, then their sum under the sheet's own word for it. Cash holds
// the debts secured on nothing beside it, the house the loans secured on
// it, and the cars the loans on them and on any other real asset, since
// a point sums a real asset with the vehicles. A debt goes where the
// asset it is secured on goes.
const groups: readonly {
  readonly kinds: readonly AccountKind[];
  readonly sum: string;
}[] = [
  { kinds: ["cash"], sum: "Cash" },
  { kinds: ["tax-free", "taxable"], sum: "Investments" },
  { kinds: ["tax-deferred"], sum: "Pension" },
  { kinds: ["house"], sum: "House Equity" },
  { kinds: ["car", "real-asset"], sum: "Car Equity" },
];

// The sheet's last columns are five of the sums a progress point
// carries, in the sheet's order, under the sheet's words for them: the
// pensions, the ISAs and not the GIAs, the property and vehicles, the
// loans secured on them, and the debts secured on nothing. Cash and the
// GIAs have no column, since the sheet sums neither.
const summed = [
  ["deferred", "Deferred"],
  ["free", "Free"],
  ["assets", "Assets"],
  ["loans", "Loans"],
  ["unsecured", "UnSec"],
] as const satisfies readonly (readonly [keyof typeof holds, string])[];

// An account's balance and a group's sum are written to the penny, and
// the five sums in whole pounds, as the sheet writes them,
// with the hyphen Intl signs a negative with, which the sheet reads,
// rather than the minus the screens draw.
const pence = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  signDisplay: "negative",
  style: "currency",
});
const pounds = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  maximumFractionDigits: 0,
  signDisplay: "negative",
  style: "currency",
});

// The columns' gap between groups.
const gap: Column = ["", ""];

// The household's balances as one row of the owner's balances sheet, to
// paste under the rows it already holds: the heading line and the row,
// each ended as CSV ends a line. The row is dated by the day given, in
// the sheet's day/month/year, and each group lists its accounts in the
// order the household lists them, so the columns are made to match the
// sheet's by ordering the accounts. A field holding a comma, a quote or
// a line break is quoted, its quotes doubled, and nothing else is. A
// heading a spreadsheet would read as a formula is written as text.
export function balancesSheet(
  accounts: readonly Account[],
  date: string,
): string {
  const columns: readonly Column[] = [
    ["Date", date.split("-").reverse().join("/")],
    gap,
    ...groups.flatMap(({ kinds, sum }): Column[] => {
      const held = accounts.filter((account) =>
        kinds.includes(placedAs(account, accounts)),
      );
      const listed = [
        ...held.filter(({ kind }) => kind !== "debt"),
        ...held.filter(({ kind }) => kind === "debt"),
      ];
      return [
        ...listed.map(({ balance, name }): Column => [
          name,
          pence.format(balance),
        ]),
        [sum, pence.format(sumOf(listed))],
        gap,
      ];
    }),
    ["Total", pence.format(sumOf(accounts))],
    gap,
    ...summed.map(([key, heading]): Column => [
      heading,
      pounds.format(sumOf(accounts.filter(holds[key]))),
    ]),
  ];
  return [
    columns.map(([heading]) => textOf(heading)),
    columns.map(([, value]) => value),
  ]
    .map((line) => `${line.map(fieldOf).join(",")}\r\n`)
    .join("");
}

// A field as CSV writes it.
function fieldOf(text: string): string {
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// The kind whose group an account is listed in: its own, or for a debt,
// the kind of the asset it is secured on, and cash for one secured on
// nothing.
function placedAs(account: Account, accounts: readonly Account[]): AccountKind {
  return account.kind === "debt"
    ? (accounts.find(({ id }) => id === account.secures)?.kind ?? "cash")
    : account.kind;
}

function sumOf(accounts: readonly Account[]): number {
  return accounts.reduce((sum, { balance }) => sum + balance, 0);
}

// A heading, an account's name among them, as text a spreadsheet does
// not run: one opening as a formula does, with =, +, - or @, or with a
// tab or a carriage return, is written after an apostrophe, which marks
// what follows it as text. Only the headings are, since the row beneath
// holds the date and the figures, a negative balance's hyphen among
// them, and pasted as they are they read as numbers.
function textOf(heading: string): string {
  return /^[=+\-@\t\r]/u.test(heading) ? `'${heading}` : heading;
}

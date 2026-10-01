"use client";

import type { JSX } from "react";

import { Wallet } from "lucide-react";

import type { Account, AccountKind } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Owner } from "@/data/owners";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { FoldedCell } from "@/components/app/molecules/folded-cell";
import { RowActions } from "@/components/app/molecules/row-actions";
import { Badge } from "@/components/kit/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { kindLabels } from "@/data/accounts";
import { monthly } from "@/lib/cadence";
import { fedOf, feedersOf, listed } from "@/lib/feeders";
import {
  balanceOf,
  formatContribution,
  formatGrowth,
  formatMonthly,
  paidMonthlyOf,
} from "@/lib/ledger";
import { formatGbp } from "@/lib/money";

interface AccountTableProps {
  readonly accounts: readonly Account[];
  readonly lines?: readonly IncomeLine[];
  readonly onDelete: (account: Account) => void;
  readonly onEdit: (account: Account) => void;
  readonly owners?: readonly Owner[];
}

// What an account is paid, as its column writes it: a figure, and a
// detail beneath it when there is one.
interface Contribution {
  readonly detail?: string;
  readonly figure: string;
}

// What a row says of an account, in both the columns and the folded
// lines: see describe.
interface Row {
  readonly balance: string;
  readonly contribution: Contribution;
  readonly growth: string;
  readonly kind: string;
  readonly owner?: string;
  readonly paid?: string;
}

type Tone = "destructive" | "secondary";

// The badge tone each kind takes. Only a debt is coloured, and it takes
// the loss tone, as its balance does everywhere else.
const tones: Record<AccountKind, Tone> = {
  car: "secondary",
  cash: "secondary",
  debt: "destructive",
  house: "secondary",
  "real-asset": "secondary",
  "tax-deferred": "secondary",
  "tax-free": "secondary",
};

// A ledger of accounts: the name and its balance carry the weight, the
// treatment is a badge, and the three figures are right-aligned mono. A
// table given the income lines writes what the salaries sacrifice into
// a pension beneath the pension's own contribution, naming them, so
// what lands in it is read off the row rather than off the salaries;
// a table given none, as the assets' is, writes each account's own
// contribution alone, since nothing feeds an asset. A table given the
// owners writes whose an ISA or a pension is beneath its name, faint,
// as the sacrifice is beneath the contribution. Each row closes with a
// pencil that reports the row's account, whose id says where a save
// writes back, and a bin that reports the account to delete, which the
// caller asks about before it does anything. A ledger holding
// nothing draws its empty state instead of the table, since a header
// row over no rows states five column names and no information. The
// words are the savings', the one list it is handed that can be empty,
// since the ledger draws the debts' section only when it holds a debt.
// The table draws no card of its own: it sits in the caller's section,
// beneath the header naming it.
// Beneath two rows or more it totals what they are paid a month and
// what they hold; a row alone is its own total, so one row draws none.
// While the table is too narrow to read across, as on a phone, each row
// folds into one cell: the name and the balance on its first line, then
// the treatment, the owner and the growth, then what it is paid, and the
// header goes, having no columns left to name. A row opens from anywhere
// on it, and its actions go with the other columns, since the dialog it
// opens is where a folded row is deleted from. The totals fold the same
// way.
export function AccountTable({
  accounts,
  lines = [],
  onDelete,
  onEdit,
  owners = [],
}: AccountTableProps): JSX.Element {
  const held = formatGbp(balanceOf(accounts));
  const paidIn = paidInOf(accounts, lines);

  if (accounts.length === 0) {
    return (
      <EmptyState
        description="Add a pension, an ISA or a savings account to see it listed here."
        icon={Wallet}
        title="No accounts yet"
      />
    );
  }

  return (
    <Table>
      <TableHeader className="folded:hidden">
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Treatment</TableHead>
          <TableHead className="text-right">Contribution</TableHead>
          <TableHead className="text-right">Growth</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="w-px">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const row = describe(account, lines, owners);
          return (
            <TableRow key={account.id}>
              <FoldedCell
                figure={row.balance}
                name={account.name}
                onOpen={(): void => {
                  onEdit(account);
                }}
              >
                <span>{aboutOf(account, row)}</span>
                {row.paid !== undefined && <span>{row.paid}</span>}
              </FoldedCell>
              <TableCell className="font-medium folded:hidden">
                {account.name}
                {row.owner !== undefined && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {row.owner}
                  </span>
                )}
              </TableCell>
              <TableCell className="folded:hidden">
                <Badge variant={tones[account.kind]}>{row.kind}</Badge>
              </TableCell>
              <TableCell className="text-right figure folded:hidden">
                {row.contribution.figure}
                {row.contribution.detail !== undefined && (
                  <span className="block text-xs text-muted-foreground">
                    {row.contribution.detail}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right figure folded:hidden">
                {row.growth}
              </TableCell>
              <TableCell className="text-right figure font-medium folded:hidden">
                {row.balance}
              </TableCell>
              <TableCell className="py-1 folded:hidden">
                <RowActions
                  name={account.name}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  row={account}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      {accounts.length > 1 && (
        <TableFooter>
          <TableRow>
            <FoldedCell figure={held} name="Total">
              <span>{paidIn.folded}</span>
            </FoldedCell>
            <TableCell className="folded:hidden">Total</TableCell>
            <TableCell className="folded:hidden" />
            <TableCell className="text-right figure folded:hidden">
              {paidIn.column}
            </TableCell>
            <TableCell className="folded:hidden" />
            <TableCell className="text-right figure folded:hidden">
              {held}
            </TableCell>
            <TableCell className="folded:hidden" />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

// What a folded row says of an account beneath its name: its treatment,
// whose it is when it is anyone's, and its growth, which for a debt is
// the rate it is charged at rather than a rate it grows at.
function aboutOf(account: Account, row: Row): string {
  return [
    row.kind,
    row.owner,
    account.kind === "debt" ? `at ${row.growth}` : `grows at ${row.growth}`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

// What an account is paid, as its column writes it: its own
// contribution, and beneath it what the salaries sacrifice into it a
// month with the employer's NI saved, naming them, for a pension one or
// more feed. A fed pension paid nothing of its own has the sacrifice as
// its figure, since that is what lands in it, and says beneath where it
// is from.
function contributionOf(
  account: Account,
  lines: readonly IncomeLine[],
): Contribution {
  const fed = monthly(fedOf(account.id, lines), "year");
  if (fed === 0) {
    return { figure: formatContribution(account) };
  }
  const from = `sacrificed from ${listed.format(feedersOf(account.id, lines))}`;
  return account.contribution === undefined
    ? { detail: from, figure: formatMonthly(fed) }
    : {
        detail: `+ ${formatMonthly(fed)} ${from}`,
        figure: formatContribution(account),
      };
}

// What a row says of an account, worked out once and drawn twice: in the
// columns while the table reads across, and on the folded lines while it
// does not, so the two say the same thing from the same figures. The
// owner is the name of the one the account names, or none for an
// account that names none or an owner the table was not given.
function describe(
  account: Account,
  lines: readonly IncomeLine[],
  owners: readonly Owner[],
): Row {
  const contribution = contributionOf(account, lines);
  const owner = owners.find(({ id }) => id === account.owner)?.name;
  return {
    balance: formatGbp(account.balance),
    contribution,
    growth: formatGrowth(account.growth),
    kind: kindLabels[account.kind],
    ...(owner !== undefined && { owner }),
    ...paidOf(account, contribution),
  };
}

// What the accounts are paid a month between them, as far as the month
// decides it in advance: every fixed sum and sacrifice, with a word for
// the spare money when any account takes it, since what the spare money
// comes to is decided month by month from what is left. The column
// writes it beneath its heading; the folded total says it is paid, as a
// folded row does.
function paidInOf(
  accounts: readonly Account[],
  lines: readonly IncomeLine[],
): { readonly column: string; readonly folded: string } {
  const total = formatMonthly(paidMonthlyOf(accounts, lines));
  return accounts.some((account) => account.contribution?.kind === "spare")
    ? { column: `${total} + spare`, folded: `${total} paid + spare` }
    : { column: total, folded: `${total} paid` };
}

// What an account is paid, as a folded row's line: the figure and the
// detail run together, a fixed sum saying it is paid, since the column
// heading that says so is folded away with it, where the spare money and
// a sacrifice say what they are already; or no line for an account paid
// nothing, which its column marks with a dash that says nothing on a
// line of its own.
function paidOf(
  account: Account,
  { detail, figure }: Contribution,
): { readonly paid?: string } {
  if (account.contribution === undefined) {
    return detail === undefined ? {} : { paid: `${figure} ${detail}` };
  }
  const said =
    account.contribution.kind === "fixed" ? `${figure} paid` : figure;
  return { paid: detail === undefined ? said : `${said} ${detail}` };
}

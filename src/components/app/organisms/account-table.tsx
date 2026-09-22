"use client";

import type { JSX } from "react";

import { Wallet } from "lucide-react";

import type { Account, AccountKind } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";

import { EmptyState } from "@/components/app/atoms/empty-state";
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
  formatContribution,
  formatGrowth,
  formatMonthly,
  paidMonthly,
} from "@/lib/ledger";
import { formatGbp } from "@/lib/money";

interface AccountTableProps {
  readonly accounts: readonly Account[];
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly lines?: readonly IncomeLine[];
  readonly onDelete?: (account: Account) => void;
  readonly onEdit?: (account: Account) => void;
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
// contribution alone, since nothing feeds an asset. A table given an
// edit handler closes each row with a pencil that reports
// the row's account, whose id says where a save writes back, and one
// given a delete handler with a bin that reports the account to delete,
// which the caller asks about before it does anything. A ledger holding
// nothing draws its empty state instead of the table, since a header
// row over no rows states five column names and no information. The
// words are the caller's, because accounts and assets are the same
// table and want different sentences. The table draws no card of its
// own: it sits in the caller's section, beneath the header naming it.
// Beneath two rows or more it totals what they are paid a month and
// what they hold; a row alone is its own total, so one row draws none.
export function AccountTable({
  accounts,
  emptyDescription,
  emptyTitle,
  lines = [],
  onDelete,
  onEdit,
}: AccountTableProps): JSX.Element {
  if (accounts.length === 0) {
    return (
      <EmptyState
        description={emptyDescription}
        icon={Wallet}
        title={emptyTitle}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Treatment</TableHead>
          <TableHead className="text-right">Contribution</TableHead>
          <TableHead className="text-right">Growth</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          {(onEdit !== undefined || onDelete !== undefined) && (
            <TableHead className="w-0">
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id}>
            <TableCell className="font-medium">{account.name}</TableCell>
            <TableCell>
              <Badge variant={tones[account.kind]}>
                {kindLabels[account.kind]}
              </Badge>
            </TableCell>
            <TableCell className="text-right figure">
              <Contribution account={account} lines={lines} />
            </TableCell>
            <TableCell className="text-right figure">
              {formatGrowth(account.growth)}
            </TableCell>
            <TableCell className="text-right figure font-medium">
              {formatGbp(account.balance)}
            </TableCell>
            {(onEdit !== undefined || onDelete !== undefined) && (
              <TableCell className="py-1">
                <RowActions
                  name={account.name}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  row={account}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
      {accounts.length > 1 && (
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell />
            <TableCell className="text-right figure">
              {paidInTotal(accounts, lines)}
            </TableCell>
            <TableCell />
            <TableCell className="text-right figure">
              {formatGbp(
                accounts.reduce((sum, account) => sum + account.balance, 0),
              )}
            </TableCell>
            {(onEdit !== undefined || onDelete !== undefined) && <TableCell />}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

// What an account is paid: its own contribution, and beneath it, faint,
// what the salaries sacrifice into it a month with the employer's NI
// saved, naming them, for a pension one or more feed. A fed pension
// paid nothing of its own shows the sacrifice as its figure, since
// that is what lands in it, and says beneath where it is from.
function Contribution({
  account,
  lines,
}: {
  readonly account: Account;
  readonly lines: readonly IncomeLine[];
}): JSX.Element {
  const fed = monthly(fedOf(account.id, lines), "year");
  if (fed === 0) {
    return <>{formatContribution(account)}</>;
  }
  const from = `sacrificed from ${listed.format(feedersOf(account.id, lines))}`;
  const [figure, detail] =
    account.contribution === undefined
      ? [formatMonthly(fed), from]
      : [formatContribution(account), `+ ${formatMonthly(fed)} ${from}`];
  return (
    <>
      {figure}
      <span className="block text-xs text-muted-foreground">{detail}</span>
    </>
  );
}

// What the accounts are paid a month between them, as far as the month
// decides it in advance: every fixed sum and sacrifice, with a word for
// the spare money when any account takes it, since what the spare money
// comes to is decided month by month from what is left.
function paidInTotal(
  accounts: readonly Account[],
  lines: readonly IncomeLine[],
): string {
  const total = formatMonthly(
    accounts.reduce((sum, account) => sum + paidMonthly(account, lines), 0),
  );
  return accounts.some((account) => account.contribution?.kind === "spare")
    ? `${total} + spare`
    : total;
}

"use client";

import type { JSX } from "react";

import { GripVertical, Wallet } from "lucide-react";

import type { Account, AccountKind, Growth } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { RowAction } from "@/components/app/atoms/row-action";
import { RowActions } from "@/components/app/molecules/row-actions";
import { Badge } from "@/components/kit/badge";
import { Card } from "@/components/kit/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { allowanceOf, kindLabels } from "@/data/accounts";
import { useReorder } from "@/hooks/use-reorder";
import { cadenceAbbreviations } from "@/lib/cadence";
import { fedOf, feedersOf, listed } from "@/lib/feeders";
import { formatGbp, formatPercent } from "@/lib/money";

interface AccountTableProps {
  readonly accounts: readonly Account[];
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly lines?: readonly IncomeLine[];
  readonly onDelete?: (account: Account) => void;
  readonly onEdit?: (account: Account) => void;
  readonly onMove?: (account: Account, target: Account) => void;
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
// which the caller asks about before it does anything. One given a
// move handler opens each row with a grip: dragged onto another row, or
// moved a row up or down with the arrow keys, it reports the account
// and the row it takes the place of, and the caller decides what the
// order means; the reordering hook holds which row is on the move and
// which it is over. A ledger holding nothing draws its
// empty state instead of the table, since a header row over no rows
// states five column names and no information. The words are the
// caller's, because accounts and assets are the same table and want
// different sentences.
export function AccountTable({
  accounts,
  emptyDescription,
  emptyTitle,
  lines = [],
  onDelete,
  onEdit,
  onMove,
}: AccountTableProps): JSX.Element {
  const { dragOver, drop, moving, over, pickUp, settle, step } = useReorder(
    accounts,
    (account, target) => {
      onMove?.(account, target);
    },
  );

  if (accounts.length === 0) {
    return (
      <Card className="py-0">
        <EmptyState
          description={emptyDescription}
          icon={Wallet}
          title={emptyTitle}
        />
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            {onMove !== undefined && (
              <TableHead className="w-0">
                <span className="sr-only">Order</span>
              </TableHead>
            )}
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
          {accounts.map((account, index) => (
            <TableRow
              className="data-moving:opacity-50 data-over:bg-accent"
              data-moving={moving?.id === account.id ? "" : undefined}
              data-over={
                over?.id === account.id && moving?.id !== account.id
                  ? ""
                  : undefined
              }
              key={account.id}
              onDragOver={(event) => {
                dragOver(event, account);
              }}
              onDrop={() => {
                drop(account);
              }}
            >
              {onMove !== undefined && (
                <TableCell className="py-1 pr-0">
                  <RowAction
                    className="cursor-grab"
                    draggable
                    icon={GripVertical}
                    name={`Move ${account.name}`}
                    onDragEnd={settle}
                    onDragStart={(event) => {
                      pickUp(event, account);
                    }}
                    onKeyDown={(event) => {
                      step(event, index);
                    }}
                  />
                </TableCell>
              )}
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
      </Table>
    </Card>
  );
}

// What an account is paid: its own contribution, and beneath it, faint,
// what the salaries sacrifice into it a year with the employer's NI
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
  const fed = fedOf(account.id, lines);
  if (fed === 0) {
    return <>{formatContribution(account)}</>;
  }
  const from = `sacrificed from ${listed.format(feedersOf(account.id, lines))}`;
  const [figure, detail] =
    account.contribution === undefined
      ? [`${formatGbp(fed)} / yr`, from]
      : [formatContribution(account), `+ ${formatGbp(fed)} / yr ${from}`];
  return (
    <>
      {figure}
      <span className="block text-xs text-muted-foreground">{detail}</span>
    </>
  );
}

// An account with nothing paid in shows a flat dash, as a flat delta does.
// One paid the spare money says the most it takes a year, which is its
// own allowance when it was given no cap.
function formatContribution(account: Account): string {
  const { contribution } = account;
  if (contribution === undefined) {
    return "—";
  }
  switch (contribution.kind) {
    case "fixed":
      return `${formatGbp(contribution.amount)} / ${cadenceAbbreviations[contribution.cadence]}`;
    case "spare": {
      const cap = contribution.cap ?? allowanceOf(account.kind);
      return cap === null
        ? "Spare, uncapped"
        : `Spare, to ${formatGbp(cap)} / yr`;
    }
  }
}

function formatGrowth(growth: Growth): string {
  switch (growth.kind) {
    case "fixed":
      return formatPercent(growth.rate);
    case "plan":
      return "Plan rate";
  }
}

"use client";

import type { DragEvent, JSX, KeyboardEvent } from "react";

import { GripVertical, Pencil, Wallet } from "lucide-react";
import { useState } from "react";

import type { Account, AccountKind, Cadence, Growth } from "@/data/accounts";

import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import { Card } from "@/components/kit/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/kit/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { allowanceOf } from "@/data/accounts";
import { formatGbp } from "@/lib/money";

interface AccountTableProps {
  readonly accounts: readonly Account[];
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly onEdit?: (account: Account) => void;
  readonly onMove?: (account: Account, target: Account) => void;
}

type Treatment = "destructive" | "secondary";

const cadences: Record<Cadence, string> = { month: "mo", year: "yr" };

// A rate is shown to two places, so 0 reads 0.00% and 0.021 reads 2.10%.
const percent = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "percent",
});

// The kind's label and the badge tone it takes. Only a debt is coloured,
// and it takes the loss tone, as its balance does everywhere else.
const treatments: Record<
  AccountKind,
  { readonly label: string; readonly variant: Treatment }
> = {
  cash: { label: "Cash", variant: "secondary" },
  debt: { label: "Debt", variant: "destructive" },
  "real-asset": { label: "Real asset", variant: "secondary" },
  "tax-deferred": { label: "Tax-deferred", variant: "secondary" },
  "tax-free": { label: "Tax-free", variant: "secondary" },
};

// A ledger of accounts: the name and its balance carry the weight, the
// treatment is a badge, and the three figures are right-aligned mono. A
// table given an edit handler closes each row with a pencil that reports
// the row's account, whose id says where a save writes back. One given a
// move handler opens each row with a grip: dragged onto another row, or
// moved a row up or down with the arrow keys, it reports the account
// and the row it takes the place of, and the caller decides what the
// order means. The drag is held as state rather than on the event, so
// the table knows which row is on the move and which it is over while
// the pointer is still between them. A ledger holding nothing draws its
// empty state instead of the table, since a header row over no rows
// states five column names and no information. The words are the
// caller's, because accounts and assets are the same table and want
// different sentences.
export function AccountTable({
  accounts,
  emptyDescription,
  emptyTitle,
  onEdit,
  onMove,
}: AccountTableProps): JSX.Element {
  const [moving, setMoving] = useState<Account | null>(null);
  const [over, setOver] = useState<Account | null>(null);

  // The row dropped on takes the drop, whichever row it was; a drop on
  // the row on the move, or with nothing on the move, is nothing.
  function drop(target: Account): void {
    if (moving !== null && moving.id !== target.id) {
      onMove?.(moving, target);
    }
    settle();
  }

  // A row is over another only while a drag crosses it; the browser
  // takes a drop only where the drag over was claimed.
  function dragOver(
    event: DragEvent<HTMLTableRowElement>,
    target: Account,
  ): void {
    if (moving !== null) {
      event.preventDefault();
      setOver(target);
    }
  }

  // Firefox starts no drag without data on the event, so the id goes on
  // it, though the state is what the drop reads.
  function pickUp(event: DragEvent<HTMLButtonElement>, account: Account): void {
    event.dataTransfer.setData("text/plain", String(account.id));
    setMoving(account);
  }

  function settle(): void {
    setMoving(null);
    setOver(null);
  }

  // The arrow keys move the row one place, taking the place of the row
  // above or below; at either end there is nothing to take, and any
  // other key is the button's own.
  function step(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const account = accounts[index];
    const target = accounts[index + stepOf(event.key)];
    if (
      account !== undefined &&
      target !== undefined &&
      target.id !== account.id
    ) {
      event.preventDefault();
      onMove?.(account, target);
    }
  }

  if (accounts.length === 0) {
    return (
      <Card className="py-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wallet aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <Table className="[&_td]:px-4 [&_th]:px-4">
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
            {onEdit !== undefined && (
              <TableHead className="w-0">
                <span className="sr-only">Edit</span>
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
                  <Button
                    aria-label={`Move ${account.name}`}
                    className="cursor-grab"
                    draggable
                    onDragEnd={settle}
                    onDragStart={(event) => {
                      pickUp(event, account);
                    }}
                    onKeyDown={(event) => {
                      step(event, index);
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <GripVertical aria-hidden />
                  </Button>
                </TableCell>
              )}
              <TableCell className="font-medium">{account.name}</TableCell>
              <TableCell>
                <Badge variant={treatments[account.kind].variant}>
                  {treatments[account.kind].label}
                </Badge>
              </TableCell>
              <TableCell className="text-right figure">
                {formatContribution(account)}
              </TableCell>
              <TableCell className="text-right figure">
                {formatGrowth(account.growth)}
              </TableCell>
              <TableCell className="text-right figure font-medium">
                {formatGbp(account.balance)}
              </TableCell>
              {onEdit !== undefined && (
                <TableCell className="py-1">
                  <Button
                    aria-label={`Edit ${account.name}`}
                    onClick={() => {
                      onEdit(account);
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Pencil aria-hidden />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
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
      return `${formatGbp(contribution.amount)} / ${cadences[contribution.cadence]}`;
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
      return percent.format(growth.rate);
    case "plan":
      return "Plan rate";
  }
}

// The place each arrow key moves a row by, and none for any other key.
function stepOf(key: string): number {
  switch (key) {
    case "ArrowDown":
      return 1;
    case "ArrowUp":
      return -1;
    default:
      return 0;
  }
}

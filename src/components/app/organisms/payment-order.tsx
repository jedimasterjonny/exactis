"use client";

import type { JSX } from "react";

import { ArrowUpDown, ChevronRight, GripVertical } from "lucide-react";
import { useState } from "react";

import type { Account } from "@/data/accounts";

import { RowAction } from "@/components/app/atoms/row-action";
import { SectionCard } from "@/components/app/molecules/section-card";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/kit/dialog";
import { Table, TableBody, TableCell, TableRow } from "@/components/kit/table";
import { kindLabels } from "@/data/accounts";
import { useReorder } from "@/hooks/use-reorder";

interface PaymentOrderProps {
  readonly accounts: readonly Account[];
  readonly label: string;
  readonly onMove: (account: Account, target: Account) => void;
}

// The order the savings are paid and drawn in, as a section of its own
// rather than as the order of a table's rows, where it went unread: the
// rows looked unsorted, since nothing said what they were sorted by.
// The order decides three things, and the card says all three, where
// the note it replaces named only the spare money: which fixed payment
// is met first when a month runs short, which account takes the spare
// money first, and which account of a kind is drawn on first. A debt
// has no place in it, being paid before any saving and drawn for when
// the month is short of it, so the card is handed the savings alone
// and says that the debts come first. It numbers the savings down the
// line and says nothing else of them.
// Reordering is a dialog opened from the card, whose rows are dragged
// by their grips or moved with the arrow keys, each move reported as it
// lands and sent to the store by the caller, as the grips on the table
// were; so the dialog closes with Done rather than Save, having nothing
// held back to save. An order of fewer than two is no order to set, so
// the card draws nothing for one.
export function PaymentOrder({
  accounts,
  label,
  onMove,
}: PaymentOrderProps): JSX.Element | null {
  const [isReordering, setIsReordering] = useState(false);
  const { dragOver, drop, moving, over, pickUp, settle, step } = useReorder(
    accounts,
    onMove,
  );

  if (accounts.length < 2) {
    return null;
  }

  return (
    <>
      <SectionCard
        actions={
          <Button
            onClick={() => {
              setIsReordering(true);
            }}
            size="sm"
            variant="outline"
          >
            <ArrowUpDown aria-hidden />
            Reorder
          </Button>
        }
        caption="Debts are always paid first. Savings are then paid in this order, and drawn on in it one kind at a time."
        label={label}
        title="Order of payment"
      >
        <CardContent>
          <ol className="flex flex-wrap items-center gap-1.5">
            {accounts.map((account, index) => (
              <li className="flex items-center gap-1.5" key={account.id}>
                <span className="flex items-center gap-2 rounded-md border px-2.5 py-1">
                  <span className="figure text-xs text-muted-foreground">
                    {String(index + 1)}
                  </span>
                  {account.name}
                </span>
                {index < accounts.length - 1 && (
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 text-muted-foreground"
                  />
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </SectionCard>
      {isReordering && (
        <Dialog
          onOpenChange={() => {
            setIsReordering(false);
          }}
          open
        >
          <DialogContent>
            <DialogHeader>
              <span className="label text-brand">Reorder</span>
              <DialogTitle>Order of payment</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">
              Drag a row by its grip, or move it with the arrow keys. Each move
              is saved as it lands.
            </p>
            <Table>
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
                    <TableCell className="w-px py-1 pr-0">
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
                    <TableCell className="w-px figure text-muted-foreground">
                      {String(index + 1)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {account.name}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {kindLabels[account.kind]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <DialogFooter>
              <DialogClose render={<Button size="sm" />}>Done</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

"use client";

import type { JSX } from "react";

import { Pencil } from "lucide-react";
import { useState } from "react";

import type { ProgressPoint } from "@/data/points";

import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { MoneyField } from "@/components/app/molecules/money-field";
import { Button } from "@/components/kit/button";
import { Card } from "@/components/kit/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { toast } from "@/components/kit/toast";
import { formatGbp } from "@/lib/money";

type Balance = Exclude<keyof ProgressPoint, "date">;

interface ProgressPointsProps {
  readonly points: readonly ProgressPoint[];
}

// The four balances, in table order. One list drives the head, the body and
// the editor's fields, so a column cannot be mono in the head and not the
// body, or editable in the dialog and absent from the table.
const balances: readonly (readonly [string, Balance])[] = [
  ["Tax-deferred", "deferred"],
  ["Tax-free", "free"],
  ["Total assets", "assets"],
  ["Asset loans", "loans"],
];

// The progress table and its editor. Rows live in state and an edit writes
// back into them, so the table reflects the edit until reload; a store
// replaces the state when there is one. The point being edited is held as
// it was, so the fields keep their defaults while the committed edits
// accumulate beside it, and it doubles as the dialog's open state.
export function ProgressPoints({ points }: ProgressPointsProps): JSX.Element {
  const [rows, setRows] = useState(points);
  const [editing, setEditing] = useState<null | ProgressPoint>(null);
  const [edits, setEdits] = useState<Partial<Record<Balance, number>>>({});

  function open(point: ProgressPoint): void {
    setEditing(point);
    setEdits({});
  }

  function dismiss(): void {
    setEditing(null);
  }

  // The reference reports "plan recalculated" beside the date. Nothing here
  // recalculates yet, so the toast says only what happened.
  function save(point: ProgressPoint): void {
    setRows(
      rows.map((row) => (row.date === point.date ? { ...row, ...edits } : row)),
    );
    setEditing(null);
    toast.add({
      description: point.date,
      title: "Point updated",
      type: "success",
    });
  }

  return (
    <>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Point</TableHead>
              {balances.map(([header]) => (
                <TableHead className="text-right" key={header}>
                  {header}
                </TableHead>
              ))}
              <TableHead className="w-0">
                <span className="sr-only">Edit</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((point) => (
              <TableRow key={point.date}>
                <TableCell>{point.date}</TableCell>
                {balances.map(([header, key]) => (
                  <TableCell className="text-right figure" key={header}>
                    {formatGbp(point[key])}
                  </TableCell>
                ))}
                <TableCell className="py-1">
                  <Button
                    aria-label={`Edit ${point.date}`}
                    onClick={() => {
                      open(point);
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Pencil aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing !== null && (
        <EditDialog
          eyebrow="Edit point"
          onDismiss={dismiss}
          onSave={() => {
            save(editing);
          }}
          title={editing.date}
        >
          <div className="grid grid-cols-2 gap-4">
            {balances.map(([label, key]) => (
              <MoneyField
                defaultValue={editing[key]}
                key={key}
                label={label}
                onValueCommitted={(value) => {
                  setEdits({ ...edits, [key]: value });
                }}
              />
            ))}
          </div>
        </EditDialog>
      )}
    </>
  );
}

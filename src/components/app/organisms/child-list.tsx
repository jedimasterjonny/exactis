"use client";

import type { JSX } from "react";

import { Baby, UserPlus } from "lucide-react";
import { useRef } from "react";

import type { Child, ChildValues } from "@/data/children";
import type { Month } from "@/data/schedule";

import { removeChild, saveChild } from "@/actions/children";
import { FieldRow } from "@/components/app/atoms/field-row";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { YearField } from "@/components/app/molecules/figure-field";
import { MonthField } from "@/components/app/molecules/month-field";
import { RowActions } from "@/components/app/molecules/row-actions";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Button } from "@/components/kit/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/kit/table";
import { earliestYear, latestYear } from "@/data/plan";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { formatMonth } from "@/lib/months";

interface ChildListProps {
  readonly kids: readonly Child[];
  readonly label: string;
  readonly opens: Month;
}

// The household's children, as a section of the accounts screen beneath
// the owners: each child a row of their name and the month they were
// born, with a pencil and a bin, and a button in the header adding
// another. A child is a name and a month born, so the dialog is the name
// over the month and the year side by side, the year held to those a
// plan's dates fall in, as the store holds it, and a month still to come
// taken as it is, for a child expected. A new child opens on the month
// the plan starts in, with no name. The section holds its own dialog and
// question, as the owners' does. The rows are the store's, handed down
// by the page, and a save or a deletion comes back with the page
// re-read. A section holding no children draws its empty state instead
// of the table.
export function ChildList({ kids, label, opens }: ChildListProps): JSX.Element {
  // The child the dialog opened on, or none for a new one, which goes
  // with the save, so the store refuses one over a child changed since.
  const openedRef = useRef<Child | null>(null);
  const { amend, dialogOf, dismiss, entry, open } = useEditor<
    ChildValues,
    Child
  >({
    describe: (child) => child.name,
    noun: "Child",
    save: async (id, values) => saveChild(id, values, openedRef.current),
  });
  const { ask, doomed, questionOf } = useRemover<Child>({
    describe: (child) => child.name,
    noun: "Child",
    remove: removeChild,
  });

  function openChild(values: ChildValues, child: Child | null): void {
    openedRef.current = child;
    open(values, child?.id ?? null);
  }

  return (
    <>
      <SectionCard
        actions={
          <Button
            onClick={() => {
              openChild({ born: opens, name: "" }, null);
            }}
            size="sm"
            variant="outline"
          >
            <UserPlus aria-hidden />
            Add child
          </Button>
        }
        caption="The children the plan is made around, each by the month they were born, or are due."
        className="pb-0"
        label={label}
        title="Children"
      >
        {kids.length === 0 ? (
          <EmptyState
            description="Add a child, or one on the way."
            icon={Baby}
            title="No children yet"
          />
        ) : (
          <Table>
            <TableBody>
              {kids.map((child) => (
                <TableRow key={child.id}>
                  <TableCell className="font-medium">{child.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatMonth(child.born)}
                  </TableCell>
                  <TableCell className="w-px py-1">
                    <RowActions
                      name={child.name}
                      onDelete={ask}
                      onEdit={(row) => {
                        const { born, name } = row;
                        openChild({ born, name }, row);
                      }}
                      row={child}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
      {entry !== null && (
        <EditDialog
          {...dialogOf(entry)}
          canSave={entry.draft.name.trim() !== ""}
          onDismiss={dismiss}
          title={entry.draft.name.trim() || "Unnamed child"}
        >
          <TextField
            defaultValue={entry.initial.name}
            label="Name"
            onValueChange={(name) => {
              amend(entry, { name });
            }}
          />
          <FieldRow layout="pair">
            <MonthField
              label="Month born"
              onValueChange={(month) => {
                amend(entry, { born: { ...entry.draft.born, month } });
              }}
              value={entry.draft.born.month}
            />
            <YearField
              defaultValue={entry.initial.born.year}
              label="Year born"
              max={latestYear}
              min={earliestYear}
              onValueCommitted={(year) => {
                amend(entry, { born: { ...entry.draft.born, year } });
              }}
            />
          </FieldRow>
        </EditDialog>
      )}
      {doomed !== null && (
        <ConfirmDialog {...questionOf(doomed)}>
          It cannot be brought back.
        </ConfirmDialog>
      )}
    </>
  );
}

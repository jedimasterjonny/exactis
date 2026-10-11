"use client";

import type { JSX } from "react";

import { UserPlus, Users } from "lucide-react";

import type { Account } from "@/data/accounts";
import type { Owner, OwnerValues } from "@/data/owners";

import { removeOwner, saveOwner } from "@/actions/owners";
import { ConfirmDialog } from "@/components/app/atoms/confirm-dialog";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { FieldRow } from "@/components/app/atoms/field-row";
import { AgeField } from "@/components/app/molecules/age-field";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { YearField } from "@/components/app/molecules/figure-field";
import { RowActions } from "@/components/app/molecules/row-actions";
import { SectionCard } from "@/components/app/molecules/section-card";
import { TextField } from "@/components/app/molecules/text-field";
import { Button } from "@/components/kit/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/kit/table";
import { openingOwner } from "@/data/owners";
import { oldestAge } from "@/data/plan";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { listed } from "@/lib/feeders";

interface OwnerListProps {
  readonly accounts: readonly Account[];
  readonly label: string;
  readonly owners: readonly Owner[];
}

// What a new owner opens as: no name, which holds the save until one is
// typed, and the years a household's first owner opens with.
const blank: OwnerValues = { ...openingOwner, name: "" };

// The people the plan is for, as a section of the accounts screen: each
// owner a row of its name with a pencil and a bin, and a button in the
// header adding another. An owner is a name, the year they were born
// and the age they retire at, so its dialog is the name over the two
// years side by side, the age typed with no slider, since it is set on
// purpose here and dragged on the dashboard; the section holds its own
// dialog and question rather than handing them up to the ledger, as
// the payment order holds its reordering. The rows are the store's, handed down by
// the page, and a save or a deletion comes back with the page re-read.
// A section holding no owners draws its empty state instead of the
// table. An owner an account names says which beneath its name and has
// its bin held, since the store refuses to delete it while the account
// is theirs: offered, the bin would ask and then fail on a refusal the
// production build hides, where the row can say why before it is asked.
// The last owner's bin is held the same way, since a plan is somebody's
// and the store refuses to keep a household with no one.
export function OwnerList({
  accounts,
  label,
  owners,
}: OwnerListProps): JSX.Element {
  const { amend, dialogOf, dismiss, entry, open } = useEditor({
    describe: (owner) => owner.name,
    noun: "Owner",
    save: saveOwner,
  });
  const { ask, doomed, questionOf } = useRemover<Owner>({
    describe: (owner) => owner.name,
    noun: "Owner",
    remove: removeOwner,
  });

  return (
    <>
      <SectionCard
        actions={
          <Button
            onClick={() => {
              open(blank, null);
            }}
            size="sm"
            variant="outline"
          >
            <UserPlus aria-hidden />
            Add owner
          </Button>
        }
        caption="The people the plan is for. Each ISA and pension belongs to one of them, and shares their allowance with the rest of its kind."
        className="pb-0"
        label={label}
        title="Owners"
      >
        {owners.length === 0 ? (
          <EmptyState
            description="Add yourself, and anyone the plan is shared with."
            icon={Users}
            title="No owners yet"
          />
        ) : (
          <Table>
            <TableBody>
              {owners.map((owner) => (
                <TableRow key={owner.id}>
                  <TableCell className="font-medium">
                    {owner.name}
                    <Holdings accounts={accounts} owner={owner} />
                  </TableCell>
                  <TableCell className="w-px py-1">
                    <RowActions
                      deleteLock={deleteLockOf(owner, accounts, owners)}
                      name={owner.name}
                      onDelete={ask}
                      onEdit={({ born, id, name, retires }) => {
                        open({ born, name, retires }, id);
                      }}
                      row={owner}
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
          title={entry.draft.name.trim() || "Unnamed owner"}
        >
          <TextField
            defaultValue={entry.initial.name}
            label="Name"
            onValueChange={(name) => {
              amend(entry, { name });
            }}
            placeholder="Me, a partner…"
          />
          <FieldRow layout="pair">
            <YearField
              defaultValue={entry.initial.born}
              hint="The year, which every age is read against"
              label="Born"
              onValueCommitted={(born) => {
                amend(entry, { born });
              }}
            />
            <AgeField
              hasSlider={false}
              hint="From which nothing is earned by working"
              label="Retires at"
              max={oldestAge}
              min={0}
              onValueCommitted={(retires) => {
                amend(entry, { retires });
              }}
              value={entry.draft.retires}
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

// Why an owner's bin is held, if it is: the accounts naming them are
// given to another owner or deleted first, or another owner is added
// first, since the plan is the last owner's. An owner holding none,
// with another listed, can go.
function deleteLockOf(
  owner: Owner,
  accounts: readonly Account[],
  owners: readonly Owner[],
): string | undefined {
  const held = heldBy(owner, accounts);
  if (held.length > 0) {
    return `Give ${listed.format(held)} to another owner first`;
  }
  return owners.length === 1
    ? "Add another owner first, since a plan is somebody's"
    : undefined;
}

// The names of the accounts naming the owner, in the order listed.
function heldBy(owner: Owner, accounts: readonly Account[]): string[] {
  return accounts
    .filter((account) => account.owner === owner.id)
    .map((account) => account.name);
}

// What an owner holds, beneath their name, faint: the accounts naming
// them, which are why they cannot be deleted, or nothing for an owner
// who holds none. The line wraps where the cell would hold it to one,
// since three names run wider than a phone and the card scrolled.
function Holdings({
  accounts,
  owner,
}: {
  readonly accounts: readonly Account[];
  readonly owner: Owner;
}): JSX.Element | null {
  const held = heldBy(owner, accounts);
  return held.length === 0 ? null : (
    <span className="block text-xs font-normal whitespace-normal text-muted-foreground">
      {`Holds ${listed.format(held)}`}
    </span>
  );
}

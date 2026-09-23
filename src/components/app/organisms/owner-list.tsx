"use client";

import type { JSX } from "react";

import { UserPlus, Users } from "lucide-react";

import type { Account } from "@/data/accounts";
import type { Owner, OwnerValues } from "@/data/owners";

import { removeOwner, saveOwner } from "@/actions/owners";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { RowActions } from "@/components/app/molecules/row-actions";
import { SectionCard } from "@/components/app/molecules/section-card";
import { TextField } from "@/components/app/molecules/text-field";
import { Button } from "@/components/kit/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/kit/table";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { listed } from "@/lib/feeders";

interface OwnerListProps {
  readonly accounts: readonly Account[];
  readonly label: string;
  readonly owners: readonly Owner[];
}

// What a new owner opens as: no name, which holds the save until one is
// typed.
const blank: OwnerValues = { name: "" };

// The people the plan is for, as a section of the accounts screen: each
// owner a row of its name with a pencil and a bin, and a button in the
// header adding another. An owner is a name and nothing more, so its
// dialog is a single field, and the section holds its own dialog and
// question rather than handing them up to the ledger, as the payment
// order holds its reordering. The rows are the store's, handed down by
// the page, and a save or a deletion comes back with the page re-read.
// A section holding no owners draws its empty state instead of the
// table. An owner an account names says which beneath its name and has
// its bin held, since the store refuses to delete it while the account
// is theirs: offered, the bin would ask and then fail on a refusal the
// production build hides, where the row can say why before it is asked.
export function OwnerList({
  accounts,
  label,
  owners,
}: OwnerListProps): JSX.Element {
  const { amend, dismiss, entry, isSaving, open, save } = useEditor({
    describe: (owner) => owner.name,
    noun: "Owner",
    save: saveOwner,
  });
  const { ask, cancel, confirm, doomed, isRemoving } = useRemover<Owner>({
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
                      deleteLock={deleteLockOf(owner, accounts)}
                      name={owner.name}
                      onDelete={ask}
                      onEdit={({ id, name }) => {
                        open({ name }, id);
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
          canSave={!isSaving && entry.draft.name.trim() !== ""}
          eyebrow={entry.id === null ? "New owner" : "Edit owner"}
          onDismiss={dismiss}
          onSave={() => {
            save(entry);
          }}
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
        </EditDialog>
      )}
      {doomed !== null && (
        <ConfirmDialog
          isBusy={isRemoving}
          onCancel={cancel}
          onConfirm={() => {
            confirm(doomed);
          }}
          title={`Delete ${doomed.name}?`}
        >
          It cannot be brought back.
        </ConfirmDialog>
      )}
    </>
  );
}

// Why an owner's bin is held, if it is: the accounts naming them are
// given to another owner or deleted first. An owner holding none can go.
function deleteLockOf(
  owner: Owner,
  accounts: readonly Account[],
): string | undefined {
  const held = heldBy(owner, accounts);
  return held.length === 0
    ? undefined
    : `Give ${listed.format(held)} to another owner first`;
}

// The names of the accounts naming the owner, in the order listed.
function heldBy(owner: Owner, accounts: readonly Account[]): string[] {
  return accounts
    .filter((account) => account.owner === owner.id)
    .map((account) => account.name);
}

// What an owner holds, beneath their name, faint: the accounts naming
// them, which are why they cannot be deleted, or nothing for an owner
// who holds none.
function Holdings({
  accounts,
  owner,
}: {
  readonly accounts: readonly Account[];
  readonly owner: Owner;
}): JSX.Element | null {
  const held = heldBy(owner, accounts);
  return held.length === 0 ? null : (
    <span className="block text-xs font-normal text-muted-foreground">
      {`Holds ${listed.format(held)}`}
    </span>
  );
}

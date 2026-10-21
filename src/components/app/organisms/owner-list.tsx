"use client";

import type { JSX } from "react";

import { UserPlus, Users } from "lucide-react";

import type { Account } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
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
import { ageOf, atAge } from "@/data/milestones";
import { openingOwner } from "@/data/owners";
import { earliestYear, latestYear, oldestAge } from "@/data/plan";
import { useEditor } from "@/hooks/use-editor";
import { useRemover } from "@/hooks/use-remover";
import { listed } from "@/lib/feeders";
import { plan as planScreen } from "@/lib/nav";

interface OwnerListProps {
  readonly accounts: readonly Account[];
  readonly label: string;
  readonly lines: readonly IncomeLine[];
  readonly owners: readonly Owner[];
}

// What a new owner opens as: no name, which holds the save until one is
// typed, and the years a household's first owner opens with.
const blank: OwnerValues = { ...openingOwner, name: "" };

// The people the plan is for, as a section of the accounts screen: each
// owner a row of its name with a pencil and a bin, and a button in the
// header adding another. An owner is a name, the year they were born
// and the age they retire at, so its dialog is the name over the two
// years side by side, the year held to those a plan's dates fall in, as
// the store holds it, and the age typed with no slider, since it is set on
// purpose here and dragged on the dashboard, and written as their
// retirement's one condition; an owner retiring when conditions hold
// has no age to type, the dialog saying where it is set in its place,
// and keeps what they retire on as it is. The section holds its own
// dialog and question rather than handing them up to the ledger, as
// the payment order holds its reordering. The rows are the store's, handed down by
// the page, and a save or a deletion comes back with the page re-read.
// A section holding no owners draws its empty state instead of the
// table. An owner an account names, or an income line is earned by,
// says which beneath its name and has its bin held, since the store
// refuses to delete it while either is theirs: offered, the bin would
// ask and then fail on a refusal the production build hides, where the
// row can say why before it is asked. The last owner's bin is held the
// same way, since a plan is somebody's and the store refuses to keep a
// household with no one.
export function OwnerList({
  accounts,
  label,
  lines,
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
  const retires =
    entry === null ? undefined : ageOf({ conditions: entry.draft.retirement });

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
                    <Holdings accounts={accounts} lines={lines} owner={owner} />
                  </TableCell>
                  <TableCell className="w-px py-1">
                    <RowActions
                      deleteLock={deleteLockOf(owner, {
                        accounts,
                        lines,
                        owners,
                      })}
                      name={owner.name}
                      onDelete={ask}
                      onEdit={({ born, id, name, retirement }) => {
                        open({ born, name, retirement }, id);
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
              label="Born"
              max={latestYear}
              min={earliestYear}
              onValueCommitted={(born) => {
                amend(entry, { born });
              }}
            />
            {retires === undefined ? (
              <p className="text-sm text-muted-foreground">
                {`Retires when conditions hold, set among the milestones on ${planScreen.label}`}
              </p>
            ) : (
              <AgeField
                hasSlider={false}
                label="Retires at"
                max={oldestAge}
                min={0}
                onValueCommitted={(age) => {
                  amend(entry, { retirement: atAge(age) });
                }}
                value={retires}
              />
            )}
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

// A faint line beneath an owner's name, wrapping where the cell would
// hold it to one, since three names run wider than a phone and the card
// scrolled.
function Beneath({ children }: { readonly children: string }): JSX.Element {
  return (
    <span className="block text-xs font-normal whitespace-normal text-muted-foreground">
      {children}
    </span>
  );
}

// Why an owner's bin is held, if it is: the accounts naming them and
// the income lines they earn are given to another owner or deleted
// first, or another owner is added first, since the plan is the last
// owner's. An owner holding and earning nothing, with another listed,
// can go.
function deleteLockOf(
  owner: Owner,
  {
    accounts,
    lines,
    owners,
  }: Pick<OwnerListProps, "accounts" | "lines" | "owners">,
): string | undefined {
  const theirs = [...heldBy(owner, accounts), ...earnedBy(owner, lines)];
  if (theirs.length > 0) {
    return `Give ${listed.format(theirs)} to another owner first`;
  }
  return owners.length === 1
    ? "Add another owner first, since a plan is somebody's"
    : undefined;
}

// The names of the income lines the owner earns, in the order listed,
// leaving out their State Pension: the household pays it on the years
// the owner holds, so it goes with them rather than holding them, and
// cannot be given to anyone else.
function earnedBy(owner: Owner, lines: readonly IncomeLine[]): string[] {
  return lines
    .filter((line) => line.owner === owner.id && line.kind !== "state-pension")
    .map(({ name }) => name);
}

// The names of the accounts naming the owner, in the order listed.
function heldBy(owner: Owner, accounts: readonly Account[]): string[] {
  return accounts
    .filter((account) => account.owner === owner.id)
    .map((account) => account.name);
}

// What an owner holds and what they earn, beneath their name, a line
// each: the accounts naming them and the income lines they earn, which
// are why they cannot be deleted, or nothing for an owner with neither.
function Holdings({
  accounts,
  lines,
  owner,
}: {
  readonly accounts: readonly Account[];
  readonly lines: readonly IncomeLine[];
  readonly owner: Owner;
}): JSX.Element {
  const held = heldBy(owner, accounts);
  const earned = earnedBy(owner, lines);
  return (
    <>
      {held.length > 0 && <Beneath>{`Holds ${listed.format(held)}`}</Beneath>}
      {earned.length > 0 && (
        <Beneath>{`Earns ${listed.format(earned)}`}</Beneath>
      )}
    </>
  );
}

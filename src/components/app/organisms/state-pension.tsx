"use client";

import type { JSX } from "react";

import { useOptimistic } from "react";

import type { Owner } from "@/data/owners";

import { saveQualifyingYears } from "@/actions/owners";
import { YearsInput } from "@/components/app/molecules/figure-field";
import { SectionCard } from "@/components/app/molecules/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { mostQualifyingYears } from "@/data/owners";
import {
  statePensionAge,
  statePensionFrom,
  statePensionOn,
} from "@/data/state-pension";
import { useSender } from "@/hooks/use-sender";
import { formatGbp } from "@/lib/money";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface StatePensionProps {
  readonly owners: readonly Owner[];
}

// Years typed for an owner, by the owner's id.
interface Typed {
  readonly id: number;
  readonly years: number;
}

// The assumptions screen's State Pension: a row for each owner, their
// name over the year they were born and the State Pension age it gives
// them, the qualifying years they have, typed in the row, and what those
// earn a year in today's money and from which year, or none under ten.
// The household pays each owner what the row says, on a line of its own
// the plan screen lists locked.
//
// The years are typed where they are shown, with no dialog, and saved
// as the focus leaves them, for that owner alone, so a name or a
// retirement saved elsewhere since is kept. Years typed back to what
// they were are not sent, since a whole figure that reads as it did is
// no change and the field commits none. The figure shows what was typed at once, and what it
// earns follows it, while the store is asked; the store's answer draws
// the screen again from what it kept, with a toast saying what the
// owner is now paid, or puts the figure back and says why under a toast
// when it is refused. An owner with none typed shows none.
export function StatePension({ owners }: StatePensionProps): JSX.Element {
  const [shown, show] = useOptimistic(
    owners,
    (current: readonly Owner[], { id, years }: Typed) =>
      current.map((owner) =>
        owner.id === id ? { ...owner, qualifyingYears: years } : owner,
      ),
  );
  const { send } = useSender();

  function save(owner: Owner, years: number): void {
    send(
      async () => {
        show({ id: owner.id, years });
        return saveQualifyingYears(owner.id, years);
      },
      {
        failure: "Qualifying years not saved",
        success: (saved) => ({
          description: `${saved.name} · ${paidOf(saved)}`,
          title: "Qualifying years saved",
        }),
      },
    );
  }

  return (
    <SectionCard
      caption="The new State Pension, in today's money and rising with inflation. Thirty-five qualifying years earn the full amount, and fewer than ten earn nothing."
      className="pb-0"
      label={subsectionLabel(assumptions, 5)}
      title="State pension"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Qualifying years</TableHead>
            <TableHead className="text-right">A year</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((owner) => (
            <TableRow key={owner.id}>
              <TableCell className="font-medium">
                {owner.name}
                <span className="block text-xs font-normal text-muted-foreground">
                  {`Born ${String(owner.born)} · State Pension age ${String(statePensionAge(owner.born))}`}
                </span>
              </TableCell>
              <TableCell className="w-24 py-1">
                <YearsInput
                  label={`Qualifying years for ${owner.name}`}
                  max={mostQualifyingYears}
                  min={0}
                  onValueCommitted={(years) => {
                    save(owner, years);
                  }}
                  value={yearsOf(owner)}
                />
              </TableCell>
              <TableCell className="text-right figure">
                {paidOf(owner)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

// What an owner's years earn: so much a year from the year they reach
// their State Pension age, or none.
function paidOf(owner: Owner): string {
  const amount = statePensionOn(yearsOf(owner));
  return amount === 0
    ? "None"
    : `${formatGbp(amount)} from ${String(statePensionFrom(owner))}`;
}

// The qualifying years an owner has, none where none are typed.
function yearsOf(owner: Owner): number {
  return owner.qualifyingYears ?? 0;
}

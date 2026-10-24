"use client";

import type { JSX } from "react";

import { useOptimistic } from "react";

import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";

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
import { mostQualifyingYears, withRecord } from "@/data/owners";
import { earliestYear, latestYear } from "@/data/plan";
import {
  qualifyingYearsOf,
  statePensionAge,
  statePensionFrom,
  statePensionOn,
} from "@/data/state-pension";
import { useSender } from "@/hooks/use-sender";
import { formatGbp } from "@/lib/money";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface StatePensionProps {
  readonly owners: readonly Owner[];
  readonly plan: Plan;
}

// The assumptions screen's State Pension: a row for each owner, their
// name over the year they were born and the State Pension age it gives
// them, the qualifying years they have and the tax year those run
// through, each typed in the row, and what the years earn a year in
// today's money and from which year, or none under ten, counted to the
// retirement the plan given lays out. The household pays each owner what
// the row says, on a line of its own the plan screen lists locked.
//
// The years and the tax year are typed where they are shown, with no
// dialog, and saved together as the focus leaves either, for that owner
// alone, so a name or a retirement saved elsewhere since is kept. Years
// typed afresh clear the tax year, which is then typed again for the
// new record, since years written under the tax year of the record
// before would count the years between twice; a tax year typed keeps
// the years shown, none being nothing, and one cleared goes, the years
// then taken as they stand. A figure typed back to what it was is not
// sent, since a whole figure that reads as it did is no change and the
// field commits none. The figures show what was typed at once, and what
// they earn follows them, while the store is asked; the store's answer
// draws the screen again from what it kept, with a toast saying what
// the owner is now paid, or puts the figures back and says why under a
// toast when it is refused, as a tax year that has not ended is. An
// owner with none typed shows none, and no tax year.
export function StatePension({ owners, plan }: StatePensionProps): JSX.Element {
  const [shown, show] = useOptimistic(
    owners,
    (current: readonly Owner[], typed: Owner) =>
      current.map((owner) => (owner.id === typed.id ? typed : owner)),
  );
  const { send } = useSender();

  function save(owner: Owner, years: number, through: null | number): void {
    send(
      async () => {
        show(withRecord(owner, years, through));
        return saveQualifyingYears(owner.id, years, through);
      },
      {
        failure: "National Insurance record not saved",
        success: (saved) => ({
          description: `${saved.name} · ${paidOf(saved, plan)}`,
          title: "National Insurance record saved",
        }),
      },
    );
  }

  return (
    <SectionCard
      caption="The new State Pension, in today's money and rising with inflation. Thirty-five qualifying years earn the full amount, and fewer than ten earn nothing. The tax year the years run through is typed after them, by the year it opens in, 2025 for 2025/26, and cleared for years taken as they stand; a year is counted on for each tax year after it worked before retirement."
      className="pb-0"
      label={subsectionLabel(assumptions, 5)}
      title="State pension"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Qualifying years</TableHead>
            <TableHead className="text-right">Through tax year</TableHead>
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
                    save(owner, years, null);
                  }}
                  value={owner.qualifyingYears ?? null}
                />
              </TableCell>
              <TableCell className="w-24 py-1">
                <YearsInput
                  label={`Tax year the qualifying years for ${owner.name} run through`}
                  max={latestYear}
                  min={earliestYear}
                  onCleared={() => {
                    save(owner, yearsOf(owner), null);
                  }}
                  onValueCommitted={(through) => {
                    save(owner, yearsOf(owner), through);
                  }}
                  value={owner.qualifiedThrough ?? null}
                />
              </TableCell>
              <TableCell className="text-right figure">
                {paidOf(owner, plan)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

// What an owner's years earn, counted as the plan lays their retirement
// out: so much a year from the year they reach their State Pension age,
// or none.
function paidOf(owner: Owner, plan: Plan): string {
  const amount = statePensionOn(qualifyingYearsOf(owner, plan));
  return amount === 0
    ? "None"
    : `${formatGbp(amount)} from ${String(statePensionFrom(owner))}`;
}

// The qualifying years an owner has, none where none are typed.
function yearsOf(owner: Owner): number {
  return owner.qualifyingYears ?? 0;
}

import type { JSX } from "react";

import { Plus } from "lucide-react";

import type { Summary } from "@/components/schedule-rows";
import type { IncomeKind, IncomeLine } from "@/data/income";
import type { Plan } from "@/engine/projection";

import { Note } from "@/components/note";
import { ScheduleRows } from "@/components/schedule-rows";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { totalOf } from "@/data/income";
import { formatGbp } from "@/lib/money";
import { plan as planScreen, sectionNumeral } from "@/lib/nav";

interface IncomeScheduleProps {
  readonly lines: readonly IncomeLine[];
  readonly plan: Plan;
}

// What each kind is called, on the badge and in the dialog's choice.
const kindLabels: Record<IncomeKind, string> = {
  employment: "Employment",
  other: "Other",
  pension: "Pension",
  "self-employment": "Self-employment",
};

// The plan screen's income schedule: the card of lines by year and the
// note that closes it. The rows are the store's, handed down by the
// page. The card takes a numeral of its own off the screen's, since the
// reference numbers each of the schedule's cards that way, and the
// expense schedule beneath it takes the next. The card's add button
// waits for the dialog, as the other screens' did.
export function IncomeSchedule({
  lines,
  plan,
}: IncomeScheduleProps): JSX.Element {
  return (
    <>
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <span className="label text-muted-foreground">
              {`Sect. ${sectionNumeral(planScreen)}.i`}
            </span>
            <h2 className="font-heading text-base font-medium">
              Income by year
            </h2>
          </div>
          <Button size="sm">
            <Plus aria-hidden />
            Add income line
          </Button>
        </CardHeader>
        <CardContent>
          <ScheduleRows
            emptyDescription="Add a salary, a pension or a side line to see it scheduled here."
            emptyTitle="No income yet"
            lines={lines}
            plan={plan}
            side="income"
            summarise={summarise}
          />
        </CardContent>
      </Card>
      <Note>
        Lines overlap freely: a step-up is a second line starting mid-way, not
        an edit to the first.
      </Note>
    </>
  );
}

// An employment line's parts, each named, leaving out one it has none of.
function formatParts(line: IncomeLine): string {
  return [
    `${formatGbp(line.amount)} base`,
    ...(line.bonus > 0 ? [`${formatGbp(line.bonus)} bonus`] : []),
    ...(line.rsu > 0 ? [`${formatGbp(line.rsu)} RSUs`] : []),
  ].join(" · ");
}

// Whether a line is paid in parts beyond its base, which only an
// employment line with a bonus or RSUs is.
function hasParts(line: IncomeLine): boolean {
  return line.bonus > 0 || line.rsu > 0;
}

// What the rows say of an income line: its kind's badge, plain since
// every kind of income is money coming in; what it pays, the parts
// summed; and, for a line paid in parts beyond its base, the parts
// written out beside the badge, so the split is seen without opening
// the line.
function summarise(line: IncomeLine): Summary {
  return {
    badge: { label: kindLabels[line.kind], variant: "secondary" },
    ...(hasParts(line) && { detail: formatParts(line) }),
    total: totalOf(line),
  };
}

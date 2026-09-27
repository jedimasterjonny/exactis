import type { JSX } from "react";

import type { Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";

import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { PinBar } from "@/components/app/atoms/pin-bar";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { markersOf } from "@/data/milestones";
import { ageIn } from "@/data/plan";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";

interface MilestoneListProps {
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
}

// What retirement's row says beside its name, since it is set on another
// screen and moves when it is.
const retirementDetail = "Moves with the retirement age on the dashboard";

// The plan screen's first card: the years the plan turns on, retirement
// among them, in the order they come. Each is a row laid out as a
// schedule's line is, its name over a pin on the plan's span where the
// line's bar would be, and its year over the age reached in it where the
// line's years would be, so a milestone reads as a line with no length
// on the same span as the lines beneath it. The columns are the
// schedules' own, the figure's left empty, so the span is as wide here
// as there and a pin sits over the years a bar beneath it reaches. The
// card comes before the schedules because the lines are laid out by the
// milestones rather than the other way round. There is always one row,
// retirement's, so there is no empty state. While the list is too narrow
// to read across, as on a phone, each row folds into lines, as a
// schedule's does: the name and the year on the first, then what
// retirement says of itself, then the pin, then the age.
export function MilestoneList({
  milestones,
  plan,
}: MilestoneListProps): JSX.Element {
  return (
    <SectionCard
      caption="The years the plan turns on, retirement among them."
      label={subsectionLabel(planScreen, 1)}
      title="Milestones"
    >
      <CardContent>
        <ul className="@container divide-y">
          {markersOf(milestones, plan).map((marker) => {
            const age = `Age ${String(ageIn(marker.year, plan))}`;
            const detail =
              marker.id === "retirement" ? retirementDetail : undefined;
            const bar = <PinBar plan={plan} year={marker.year} />;
            return (
              <li
                className="grid grid-cols-[minmax(0,1fr)_9rem_11rem] items-center gap-4 py-3 first:pt-0 last:pb-0 folded:grid-cols-1"
                key={marker.id}
              >
                <div className="unfolded:hidden">
                  <FoldedLines figure={String(marker.year)} name={marker.name}>
                    {detail !== undefined && <span>{detail}</span>}
                    <div className="my-1">{bar}</div>
                    <span>{age}</span>
                  </FoldedLines>
                </div>
                <div className="grid min-w-0 gap-2 folded:hidden">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{marker.name}</span>
                    {detail !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {detail}
                      </span>
                    )}
                  </div>
                  {bar}
                </div>
                <div className="col-start-3 grid gap-0.5 text-right folded:hidden">
                  <span className="figure">{marker.year}</span>
                  <span className="label text-muted-foreground/60">{age}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </SectionCard>
  );
}

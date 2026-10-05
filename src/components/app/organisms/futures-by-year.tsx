"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Future, FutureYear } from "@/engine/futures";

import { MilestoneChips } from "@/components/app/atoms/milestone-chips";
import { RowAction } from "@/components/app/atoms/row-action";
import { SpanRuler } from "@/components/app/atoms/span-ruler";
import { YearStrip } from "@/components/app/atoms/year-strip";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { markersOf, yearsOf } from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { yearIn, yearsIn } from "@/engine/futures";
import { formatCount } from "@/lib/count";
import { listed } from "@/lib/feeders";
import { formatGbp, formatWholePercent } from "@/lib/money";
import { chance, subsectionLabel } from "@/lib/nav";
import { laneColumns } from "@/lib/span";

interface FuturesByYearProps {
  readonly futures: readonly Future[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly projected: Future;
}

interface LineProps {
  readonly detail?: string;
  readonly figure: string;
  readonly isLoss?: boolean;
  readonly isTotal?: boolean;
  readonly label: string;
}

// The run laid on the plan's years, on the span the plan screen lays its
// lines and its cash flow on: what the middle future holds as each year
// opens, rising from the rule, and how many futures first fall short in
// it, hanging beneath it in red. Pounds and counts share no scale, so
// each is drawn against its own most. Beside the strip, how many are
// still lasting at the end of the year chosen; beneath it, the plan's
// milestones to jump to, and the year chosen read as a ledger: how many
// futures last into it, fall short in it and last out of it, and what
// the poor, middle and good futures and the plan at its own rates hold
// as it opens. It opens on the plan's last year, so the ledger closes
// on the run's own count.
export function FuturesByYear({
  futures,
  milestones,
  plan,
  projected,
}: FuturesByYearProps): JSX.Element {
  const end = endYear(plan);
  const [year, setYear] = useState(end);
  const markers = markersOf(milestones, plan).filter(
    (marker) => marker.year >= plan.from && marker.year <= end,
  );
  const years = yearsIn(futures, plan);
  const mostHeld = Math.max(1, ...years.map(({ middle }) => middle));
  const mostFell = Math.max(1, ...years.map(({ fell }) => fell));
  const chosen = yearIn(futures, plan, year);
  return (
    <SectionCard
      caption="What the futures hold as each year opens, in today's money, on the span the plan's lines are laid on: the middle future rising from the rule, and the futures first falling short that year hanging beneath it, in red. Drag along it, choose a milestone or step a year at a time to read the year."
      label={subsectionLabel(chance, 2)}
      title="Year by year"
    >
      <CardContent className="@container grid gap-4">
        <div
          className={cn("grid gap-x-4 gap-y-1 folded:grid-cols-1", laneColumns)}
        >
          <SpanRuler plan={plan} />
          <span className="col-start-1">
            <YearStrip
              label="Year"
              marks={yearsOf(markers)}
              onValueChange={setYear}
              plan={plan}
              value={year}
              valueText={(at) => {
                const read = yearIn(futures, plan, at);
                return `${String(at)}, age ${String(ageIn(at, plan))}: ${formatCount(read.lasting - read.fell)} futures lasting, the middle one holding ${formatGbp(read.middle)}`;
              }}
              years={years.map(({ fell, middle, year: at }) => ({
                drawn: fell / mostFell,
                isShort: fell > 0,
                saved: middle / mostHeld,
                year: at,
              }))}
            />
          </span>
          <span className="flex items-baseline justify-between gap-3 self-center unfolded:contents">
            <span className="grid gap-0.5 self-center unfolded:text-right">
              <span className="figure font-medium">
                {formatCount(chosen.lasting - chosen.fell)}
              </span>
              <span className="text-xs text-muted-foreground">
                still lasting
              </span>
            </span>
            <span className="grid gap-0.5 self-center text-right">
              <span className="figure">{year}</span>
              <span className="label text-muted-foreground/60">
                {`Age ${String(ageIn(year, plan))}`}
              </span>
            </span>
          </span>
        </div>
        {markers.length > 0 && (
          <MilestoneChips
            markers={markers}
            onSelect={(tie) => {
              for (const marker of markers) {
                if (marker.id === tie) {
                  setYear(marker.year);
                }
              }
            }}
            selected={markers.find((marker) => marker.year === year)?.id}
          />
        )}
        <YearLedger
          chosen={chosen}
          marked={markers
            .filter((marker) => marker.year === year)
            .map(({ name }) => name)}
          onYear={setYear}
          plan={plan}
          projected={yearIn([projected], plan, year).middle}
          run={futures.length}
        />
      </CardContent>
    </SectionCard>
  );
}

// A line of the year's ledger: what it counts, what that is, and its
// figure, in red for a loss and heavier for a total.
function Line({
  detail,
  figure,
  isLoss = false,
  isTotal = false,
  label,
}: LineProps): JSX.Element {
  return (
    <li className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="grid gap-0.5">
        <span className={isTotal ? "font-medium" : undefined}>{label}</span>
        {detail !== undefined && (
          <span className="text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
      <span
        className={cn(
          "figure",
          isTotal && "font-medium",
          isLoss && "text-destructive",
        )}
      >
        {figure}
      </span>
    </li>
  );
}

// The year chosen, read as a ledger: the futures lasting into it, those
// first falling short in it and those lasting out of it, then what the
// futures and the plan at its own rates hold as it opens. A year steps
// back and on a year at a time, within the plan's years.
function YearLedger({
  chosen,
  marked,
  onYear,
  plan,
  projected,
  run,
}: {
  readonly chosen: FutureYear;
  readonly marked: readonly string[];
  readonly onYear: (year: number) => void;
  readonly plan: Plan;
  readonly projected: number;
  readonly run: number;
}): JSX.Element {
  const { year } = chosen;
  const lastingOut = chosen.lasting - chosen.fell;
  return (
    <div className="grid gap-3 rounded-md bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {[
            `${String(year)}, age ${String(ageIn(year, plan))}, in today's money`,
            ...(marked.length === 0 ? [] : [listed.format(marked)]),
          ].join(" · ")}
        </span>
        <span className="flex shrink-0 gap-1">
          <RowAction
            disabled={year === plan.from}
            icon={ChevronLeft}
            name="Year before"
            onClick={() => {
              onYear(year - 1);
            }}
          />
          <RowAction
            disabled={year === endYear(plan)}
            icon={ChevronRight}
            name="Year after"
            onClick={() => {
              onYear(year + 1);
            }}
          />
        </span>
      </div>
      <ul className="divide-y">
        <Line
          figure={formatCount(chosen.lasting)}
          label="Lasting into the year"
        />
        <Line
          detail="Ran out of money, or drew a pension before it can be drawn"
          figure={chosen.fell === 0 ? "0" : `−${formatCount(chosen.fell)}`}
          isLoss={chosen.fell > 0}
          label="Fell short this year"
        />
        <Line
          detail={`${formatWholePercent(lastingOut / Math.max(run, 1))} of the ${formatCount(run)}`}
          figure={formatCount(lastingOut)}
          isTotal
          label="Lasting at the year's end"
        />
        <Line
          detail="A tenth of the futures hold less"
          figure={formatGbp(chosen.poor)}
          label="Poor future"
        />
        <Line
          detail="Half hold less, and half more"
          figure={formatGbp(chosen.middle)}
          label="Middle future"
        />
        <Line
          detail="A tenth hold more"
          figure={formatGbp(chosen.good)}
          label="Good future"
        />
        <Line
          detail="At the plan's rates every year, as the dashboard draws it"
          figure={formatGbp(projected)}
          label="As projected"
        />
      </ul>
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { Banknote, Lock, Pencil, Receipt } from "lucide-react";

import type { LineValues, Side } from "@/data/schedule";
import type { Plan } from "@/engine/projection";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { RowAction } from "@/components/app/atoms/row-action";
import { SpanBar } from "@/components/app/atoms/span-bar";
import { Badge } from "@/components/kit/badge";
import { endYear } from "@/engine/projection";
import { cadenceAbbreviations } from "@/lib/cadence";
import { growthLabels } from "@/lib/lines";
import { formatGbp } from "@/lib/money";

// What a schedule says of a line that the rows cannot read off it: the
// badge its kind takes, what it pays at its cadence, and any detail to
// write beside the badge.
export interface Summary {
  readonly badge: { readonly label: string; readonly variant: Tone };
  readonly detail?: string;
  readonly lock?: string;
  readonly total: number;
}

// A line as the rows read it: what every line holds, with the id the row
// is keyed on.
interface Line extends LineValues {
  readonly id: number;
}

interface ScheduleRowsProps<TLine extends Line> {
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly lines: readonly TLine[];
  readonly onEdit?: (line: TLine) => void;
  readonly plan: Plan;
  readonly side: Side;
  readonly summarise: (line: TLine) => Summary;
}

type Tone = "caution" | "destructive" | "secondary";

// The icon each schedule's empty state takes.
const icons: Record<Side, LucideIcon> = { expense: Receipt, income: Banknote };

// A schedule's rows, one per line: the name and the kind's badge, with the
// line's detail beside them when its schedule gives one, over a bar
// placing the line on the plan's span; what the line pays at its cadence
// over what it grows with; the years it runs over the ages reached, an
// open-ended line running to the end; and, when given an edit handler, a
// pencil that reports the row's line, whose id says where a save writes
// back. The schedule reads its own lines, so what the rows cannot read
// off one, the badge, the figure and the detail, comes from it. The
// figures are right-aligned mono, as in every ledger. A schedule holding
// nothing draws its empty state instead of a list of nothing.
export function ScheduleRows<TLine extends Line>({
  emptyDescription,
  emptyTitle,
  lines,
  onEdit,
  plan,
  side,
  summarise,
}: ScheduleRowsProps<TLine>): JSX.Element {
  if (lines.length === 0) {
    return (
      <EmptyState
        description={emptyDescription}
        icon={icons[side]}
        title={emptyTitle}
      />
    );
  }

  return (
    <ul className="divide-y">
      {lines.map((line) => {
        const summary = summarise(line);
        return (
          <li
            className="grid grid-cols-[minmax(0,1fr)_9rem_11rem_auto] items-center gap-4 py-3 first:pt-0 last:pb-0"
            key={line.id}
          >
            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{line.name}</span>
                <Badge variant={summary.badge.variant}>
                  {summary.badge.label}
                </Badge>
                {summary.detail !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {summary.detail}
                  </span>
                )}
              </div>
              <SpanBar
                firstYear={line.firstYear}
                lastYear={line.lastYear}
                plan={plan}
                side={side}
              />
            </div>
            <div className="grid gap-0.5 text-right">
              <span className="figure font-medium">
                {formatGbp(summary.total)}
                <span className="text-xs font-normal text-muted-foreground">
                  {` / ${cadenceAbbreviations[line.cadence]}`}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {growthLabels[line.growth]}
              </span>
            </div>
            <div className="grid gap-0.5 text-right">
              <span className="figure">{formatYears(line)}</span>
              <span className="label text-muted-foreground/60">
                {formatAges(line, plan)}
              </span>
            </div>
            {onEdit !== undefined &&
              (summary.lock === undefined ? (
                <RowAction
                  icon={Pencil}
                  name={`Edit ${line.name}`}
                  onClick={() => {
                    onEdit(line);
                  }}
                />
              ) : (
                <span
                  aria-label={summary.lock}
                  className="inline-flex size-7 items-center justify-center text-muted-foreground/60"
                  role="img"
                >
                  <Lock aria-hidden className="size-4" />
                </span>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

// The ages reached in the line's first and last years, the last the age
// at the plan's end for a line that runs to it.
function formatAges(line: LineValues, plan: Plan): string {
  const first = line.firstYear - plan.born;
  const last = (line.lastYear ?? endYear(plan)) - plan.born;
  return `Age ${String(first)}–${String(last)}`;
}

// The years the line runs, an open-ended one to the end.
function formatYears(line: LineValues): string {
  const last = line.lastYear === null ? "end" : String(line.lastYear);
  return `${String(line.firstYear)} – ${last}`;
}

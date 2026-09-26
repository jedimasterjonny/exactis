import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { cn } from "cn";
import { Banknote, Receipt } from "lucide-react";

import type { Plan } from "@/data/plan";
import type { LineValues, Side } from "@/data/schedule";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { RowLock } from "@/components/app/atoms/row-lock";
import { SpanBar } from "@/components/app/atoms/span-bar";
import { RowActions } from "@/components/app/molecules/row-actions";
import { Badge } from "@/components/kit/badge";
import { ageIn, endYear } from "@/data/plan";
import { cadenceAbbreviations } from "@/lib/cadence";
import { endOf, growthLabels } from "@/lib/lines";
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

// What a row says of a line, in both the columns and the folded lines:
// see describe.
interface Row {
  readonly ages: string;
  readonly cadence: string;
  readonly growth: string;
  readonly total: string;
  readonly years: string;
}

interface ScheduleRowsProps<TLine extends Line> {
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly lines: readonly TLine[];
  readonly onDelete?: (line: TLine) => void;
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
// over what it grows with; the years it runs over the ages reached, to
// the month when it ends part way through a year and an open-ended line
// running to the end; and, when given an edit handler, a pencil that
// reports the row's line, whose id says where a save writes back, and
// when given a delete handler a bin beside it, in the one actions
// column, which reports the line the schedule asks about before it
// goes. A locked line draws its lock in place of both, since it is
// neither edited nor deleted here. The schedule reads its own lines, so
// what the rows cannot read off one, the badge, the figure and the
// detail, comes from it. The figures are right-aligned mono, as in every
// ledger. A schedule holding nothing draws its empty state instead of a
// list of nothing. While the list is too narrow to read across, as on a
// phone, each row folds into lines, as a ledger's does: the name and
// what the line pays on the first, then its kind and how it grows, then
// its detail when it has one, then the bar across the row, then the
// years and the ages. The list is the container it folds by, at the
// width the ledgers fold at. A row given an edit handler opens from
// anywhere on it, the bar letting a tap through to the row beneath it,
// and its actions fold away with the columns, the dialog it opens being
// where it is deleted from; a locked row opens nothing and draws its
// lock where the chevron would be, the same lock as its column, which
// folds away with the rest. Each row is described once and both its
// copies draw the description, so the two say the same thing.
export function ScheduleRows<TLine extends Line>({
  emptyDescription,
  emptyTitle,
  lines,
  onDelete,
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

  const hasActions = onEdit !== undefined || onDelete !== undefined;

  return (
    <ul className="@container divide-y">
      {lines.map((line) => {
        const summary = summarise(line);
        const row = describe(line, plan, summary);
        const lock =
          hasActions && summary.lock !== undefined ? (
            <RowLock reason={summary.lock} />
          ) : undefined;
        const bar = (
          <SpanBar
            firstYear={line.firstYear}
            lastMonth={line.lastMonth}
            lastYear={line.lastYear}
            plan={plan}
            side={side}
          />
        );
        return (
          <li
            className="relative grid grid-cols-[minmax(0,1fr)_9rem_11rem_auto] items-center gap-4 py-3 first:pt-0 last:pb-0 folded:grid-cols-1"
            key={line.id}
          >
            <div className="unfolded:hidden">
              <FoldedLines
                figure={`${row.total} / ${row.cadence}`}
                lock={lock}
                name={line.name}
                onOpen={
                  onEdit === undefined || lock !== undefined
                    ? undefined
                    : (): void => {
                        onEdit(line);
                      }
                }
              >
                <span>{`${summary.badge.label} · ${row.growth}`}</span>
                {summary.detail !== undefined && <span>{summary.detail}</span>}
                <div className="pointer-events-none my-1">{bar}</div>
                <span>{`${row.years} · ${row.ages}`}</span>
              </FoldedLines>
            </div>
            <div className="grid min-w-0 gap-2 folded:hidden">
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
              {bar}
            </div>
            <div className="grid gap-0.5 text-right folded:hidden">
              <span className="figure font-medium">
                {row.total}
                <span className="text-xs font-normal text-muted-foreground">
                  {` / ${row.cadence}`}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {row.growth}
              </span>
            </div>
            <div className="grid gap-0.5 text-right folded:hidden">
              <span className="figure">{row.years}</span>
              <span className="label text-muted-foreground/60">{row.ages}</span>
            </div>
            {hasActions && (
              <div
                className={cn(
                  (onEdit !== undefined || lock !== undefined) &&
                    "folded:hidden",
                )}
              >
                {lock === undefined ? (
                  <RowActions
                    name={line.name}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    row={line}
                  />
                ) : (
                  <span className="inline-flex size-7 items-center justify-center">
                    {lock}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// What a row says of a line, worked out once and drawn twice: in the
// columns while the list reads across, and on the folded lines while it
// does not. What the line pays is its schedule's figure at its cadence,
// and the ages are those reached in its first and last years, the last
// the age at the plan's end for a line that runs to it.
function describe(line: LineValues, plan: Plan, summary: Summary): Row {
  const first = ageIn(line.firstYear, plan);
  const last = ageIn(line.lastYear ?? endYear(plan), plan);
  return {
    ages: `Age ${String(first)}–${String(last)}`,
    cadence: cadenceAbbreviations[line.cadence],
    growth: growthLabels[line.growth],
    total: formatGbp(summary.total),
    years: `${String(line.firstYear)} – ${endOf(line) ?? "end"}`,
  };
}

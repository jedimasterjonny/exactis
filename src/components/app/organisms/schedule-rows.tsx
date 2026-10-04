import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import type { JSX } from "react";

import { cn } from "cn";
import { Banknote, ChevronRight, Flag, Receipt } from "lucide-react";

import type { Marker } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { LineValues, Side, Tie } from "@/data/schedule";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { RowLock } from "@/components/app/atoms/row-lock";
import { RowOpener } from "@/components/app/atoms/row-opener";
import { SpanBar } from "@/components/app/atoms/span-bar";
import { Badge } from "@/components/kit/badge";
import { yearsOf } from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { cadenceAbbreviations } from "@/lib/cadence";
import { counted } from "@/lib/count";
import { growthLabels, spanOf } from "@/lib/lines";
import { formatGbp } from "@/lib/money";
import { laneColumns } from "@/lib/span";

// What a schedule says of a line that the rows cannot read off it: the
// badge its kind takes, if it has one, what it pays at its cadence, any
// detail to write beside the badge, whether it is a loan's payments,
// which its bar is drawn in red for, why it is held here and the screen
// it is set on, for a line edited elsewhere, and the line as it is paid where
// that stops short of where it says it ends, which the row draws in its
// place.
export interface Summary {
  readonly badge?: { readonly label: string; readonly variant: Tone };
  readonly detail?: string;
  readonly isLoan?: boolean;
  readonly lock?: { readonly at: Route; readonly reason: string };
  readonly paid?: LineValues;
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
  readonly ties: null | string;
  readonly total: string;
  readonly years: string;
}

interface ScheduleRowsProps<TLine extends Line> {
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly lines: readonly TLine[];
  readonly milestones: readonly Marker[];
  readonly onEdit: (line: TLine) => void;
  readonly plan: Plan;
  readonly side: Side;
  readonly summarise: (line: TLine) => Summary;
}

type Tone = "caution" | "destructive" | "secondary";

// The icon each schedule's empty state takes.
const icons: Record<Side, LucideIcon> = { expense: Receipt, income: Banknote };

// A schedule's rows, one per line: the name and any badge, with the
// line's detail beside them when its schedule gives one, over a bar
// placing the line on the plan's span; what the line pays at its cadence
// over what it grows with; the years it runs over the ages reached, to
// the month when it ends part way through a year and an open-ended line
// running to the end, the milestones ruled across every bar; and a
// chevron saying the row opens. The row opens
// from anywhere on it, its name the button that reports the line, whose
// id says where a save writes back, as an account's row does on the
// accounts screen, and the dialog it opens is where it is deleted from.
// A locked line draws its lock in the chevron's place, since it is
// neither edited nor deleted here, and its name links to the screen it
// is set on, so a press on it goes where it can be changed. The schedule
// reads its own lines, so
// what the rows cannot read off one, the badge, the figure and the
// detail, comes from it. The figures are right-aligned mono, as in every
// ledger. A line tied to a milestone at either end says which beside
// its detail, flagged in oxide as the milestones are, "Until
// Retirement", its years staying the figures they fall on, since a name
// in their place would not fit their column; and a line whose milestone
// has moved past its other end says it runs no years in place of its
// ages. A line its schedule says is paid short of its own end, as a
// salary is past retirement, is drawn as it is paid, its bar, years and
// ties all, since a row promising years the plan never pays reads as
// income the plan does not have; the row still opens the line as it
// is. A schedule holding nothing draws its empty state instead of a
// list of nothing. While the list is too narrow to read across, as on a
// phone, each row folds into lines, as a ledger's does: the name and
// what the line pays on the first, then its kind and how it grows, then
// its detail when it has one, then its milestones when it is tied to
// any, then the bar across the row, then the years and the ages. The
// list is the container it folds by, at the width the ledgers fold at.
// Either way the bar lets a press through to the row beneath it. Each
// row is described once and both its copies draw the description, so
// the two say the same thing.
export function ScheduleRows<TLine extends Line>({
  emptyDescription,
  emptyTitle,
  lines,
  milestones,
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
    <ul className="@container divide-y">
      {lines.map((line) => {
        const summary = summarise(line);
        const paid = summary.paid ?? line;
        const row = describe(paid, { milestones, plan }, summary);
        const held = summary.lock;
        const open = (): void => {
          onEdit(line);
        };
        const bar = (
          <SpanBar
            endsAt={paid.endsAt}
            firstYear={paid.firstYear}
            isLoan={summary.isLoan === true}
            lastMonth={paid.lastMonth}
            lastYear={paid.lastYear}
            marks={yearsOf(milestones)}
            plan={plan}
            side={side}
            startsAt={paid.startsAt}
          />
        );
        return (
          <li
            className={cn(
              "relative grid items-center gap-4 py-3 first:pt-0 last:pb-0 folded:grid-cols-1",
              laneColumns,
            )}
            key={line.id}
          >
            <div className="unfolded:hidden">
              <FoldedLines
                figure={`${row.total} / ${row.cadence}`}
                name={line.name}
                {...(held === undefined
                  ? { onOpen: open }
                  : { href: held.at, lock: <RowLock reason={held.reason} /> })}
              >
                <span>
                  {[summary.badge?.label, row.growth]
                    .filter((part) => part !== undefined)
                    .join(" · ")}
                </span>
                {summary.detail !== undefined && <span>{summary.detail}</span>}
                {row.ties !== null && <Ties>{row.ties}</Ties>}
                <div className="pointer-events-none my-1">{bar}</div>
                <span>{`${row.years} · ${row.ages}`}</span>
              </FoldedLines>
            </div>
            <div className="grid min-w-0 gap-2 folded:hidden">
              <div className="flex flex-wrap items-baseline gap-2">
                {held === undefined ? (
                  <RowOpener onOpen={open}>{line.name}</RowOpener>
                ) : (
                  <RowOpener href={held.at}>{line.name}</RowOpener>
                )}
                {summary.badge !== undefined && (
                  <Badge
                    className="self-center"
                    variant={summary.badge.variant}
                  >
                    {summary.badge.label}
                  </Badge>
                )}
                {summary.detail !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {summary.detail}
                  </span>
                )}
                {row.ties !== null && (
                  <span className="text-xs text-muted-foreground">
                    <Ties>{row.ties}</Ties>
                  </span>
                )}
              </div>
              <div className="pointer-events-none">{bar}</div>
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
            <span className="inline-flex size-7 items-center justify-center folded:hidden">
              {held === undefined ? (
                <ChevronRight
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              ) : (
                <RowLock reason={held.reason} />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Where a tied end falls: at the milestone named, or the years after it
// the end falls, and nowhere for an end tied to nothing.
function afterOf(name: null | string, after: number): null | string {
  if (name === null || after === 0) {
    return name;
  }
  return `${counted(after, "year")} after ${name}`;
}

// What a row says of a line, worked out once and drawn twice: in the
// columns while the list reads across, and on the folded lines while it
// does not. What the line pays is its schedule's figure at its cadence,
// and the ages are those reached in its first and last years, the last
// the age at the plan's end for a line that runs to it, or that it runs
// no years for a line whose last year is before its first. The
// milestones it is tied to are named as its ends are: "From Kids leave
// home", "Until Retirement", or both, "Kids leave home to Retirement",
// and an end some years after its milestone says so, "Until 3 years
// after Retirement".
function describe(
  line: LineValues,
  laidOut: { readonly milestones: readonly Marker[]; readonly plan: Plan },
  summary: Summary,
): Row {
  const { milestones, plan } = laidOut;
  const first = ageIn(line.firstYear, plan);
  const last = ageIn(line.lastYear ?? endYear(plan), plan);
  return {
    ages:
      last < first ? "Runs no years" : `Age ${String(first)}–${String(last)}`,
    cadence: cadenceAbbreviations[line.cadence],
    growth: growthLabels[line.growth],
    ties: tiesOf(
      nameOf(line.startsAt, milestones),
      afterOf(nameOf(line.endsAt, milestones), line.endsAfter),
    ),
    total: formatGbp(summary.total),
    years: spanOf(line),
  };
}

// The name of the milestone a tie is to, or none for an end tied to
// nothing.
function nameOf(tie: null | Tie, milestones: readonly Marker[]): null | string {
  return milestones.find(({ id }) => id === tie)?.name ?? null;
}

// The milestones a line is tied to, after a flag in oxide, the colour
// the milestones are pinned in. The words set its baseline, so they sit
// on the line of the name they follow, and the flag is centred on them:
// leading with the flag, the tie took its baseline from the flag's foot
// and stood two pixels above the name's line.
function Ties({ children }: { readonly children: string }): JSX.Element {
  return (
    <span className="inline-flex items-baseline gap-1">
      <Flag aria-hidden className="size-3 self-center text-brand" />
      {children}
    </span>
  );
}

// The milestones a line's ends are tied to, named as its ends are, or
// none for a line tied to none.
function tiesOf(from: null | string, until: null | string): null | string {
  if (from === null) {
    return until === null ? null : `Until ${until}`;
  }
  return until === null ? `From ${from}` : `${from} to ${until}`;
}

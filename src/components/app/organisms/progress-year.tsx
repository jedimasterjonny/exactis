import type { JSX } from "react";

import type { LegendEntry } from "@/components/app/atoms/legend-table";
import type { LatestYear, Move } from "@/data/progress";

import { LegendTable } from "@/components/app/atoms/legend-table";
import { SegmentBar } from "@/components/app/atoms/segment-bar";
import { Card, CardContent } from "@/components/kit/card";
import { movesOf, netWorthOf, sumOf } from "@/data/progress";
import { balanceNames, balanceTones, partsOf } from "@/lib/balances";
import { counted } from "@/lib/count";
import { formatGbp, formatSignedGbp } from "@/lib/money";
import { formatMonthShort, monthName, monthsBetween } from "@/lib/months";

interface ProgressYearProps {
  readonly year: LatestYear;
}

// What the latest year came to, where the screen opens, as the chance
// of success opens on what its futures come to: the move in net worth
// as the figure, over the months it was read across; beside it what
// each balance added and took away along a bar, the balances adding
// first and those taking away after the wider gap, with what each side
// came to, over a sentence saying how far net worth rose or fell, or
// that it held, and, where the year runs twelve months whole and rose,
// how that stands against the years kept before it, and another saying
// where it went from and to; and each balance's move beside where it stands now, which is
// where the bar's tones are named. A debt paid down adds and one run
// up takes away, as it moves net worth.
export function ProgressYear({ year }: ProgressYearProps): JSX.Element {
  const { before, from, to } = year;
  const moved = netWorthOf(to) - netWorthOf(from);
  const months = monthsBetween(from.month, to.month);
  const moves = movesOf(from, to);
  const addedSum = sumOf(moves, 1);
  const takenSum = sumOf(moves, -1);
  const entryOf = ({ key, move }: Move): LegendEntry => ({
    figure: formatSignedGbp(move),
    key,
    name: balanceNames[key],
    note: `${formatGbp(to[key])} now`,
    tone: balanceTones[key],
  });
  const span = `${spanOf(months)} to ${monthName(to.month.month, "long")}`;
  return (
    <Card aria-label="What the year came to" role="region">
      <CardContent className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-10 xl:grid-cols-[auto_minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-3">
          <p className="figure text-5xl font-medium tracking-tighter">
            {formatSignedGbp(moved)}
          </p>
          <p className="text-xs text-muted-foreground">
            {`${counted(months, "month")} to ${formatMonthShort(to.month)}`}
          </p>
        </div>
        <div className="grid content-start gap-3">
          <SegmentBar groups={[partsOf(moves, 1), partsOf(moves, -1)]} />
          <p className="flex justify-between gap-4 text-xs text-muted-foreground">
            <span>
              <span className="figure text-foreground">
                {formatGbp(addedSum)}
              </span>{" "}
              added
            </span>
            <span>
              <span className="figure text-foreground">
                {formatGbp(takenSum)}
              </span>{" "}
              taken away
            </span>
          </p>
          <h2 className="mt-3 font-heading text-2xl font-semibold tracking-tight text-balance">
            {verdictOf(moved, span, before)}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {`From ${formatGbp(netWorthOf(from))} in ${formatMonthShort(from.month)} to ${formatGbp(netWorthOf(to))} in ${formatMonthShort(to.month)}.`}
          </p>
        </div>
        <div className="grid content-start items-start gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
          <LegendTable
            caption={`Added · ${formatGbp(addedSum)}`}
            entries={moves.filter(({ move }) => move > 0).map(entryOf)}
          />
          <LegendTable
            caption={`Taken away · ${formatGbp(takenSum)}`}
            entries={moves.filter(({ move }) => move < 0).map(entryOf)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// How a year's rise stands against the years kept before it, as the
// sentence saying it goes on: more than in all of them, less than in
// all, no more than in any where it beat none but matched one, or more
// than in how many it beat. The years are called earlier rather than
// before it, since a year either end of which was not kept is passed
// over. Nothing where there is no year to stand against.
function against(moved: number, before: readonly number[]): string {
  if (before.length === 0) {
    return "";
  }
  const beaten = before.filter((each) => moved > each).length;
  const lost = before.filter((each) => moved < each).length;
  const years =
    before.length === 1
      ? "the earlier year"
      : `any of the ${String(before.length)} earlier years`;
  if (beaten === before.length) {
    return `, more than in ${years}`;
  }
  if (lost === before.length) {
    return `, less than in ${years}`;
  }
  return beaten === 0
    ? `, no more than in ${years}`
    : `, more than in ${String(beaten)} of the ${String(before.length)} earlier years`;
}

// The months a move was read over, as the sentence names them.
function spanOf(months: number): string {
  if (months === 12) {
    return "the year";
  }
  return months === 1 ? "the month" : `the ${String(months)} months`;
}

// What the move came to, as the card's heading says it: how far net
// worth rose, held against the years kept before it, how far it fell,
// or that it held.
function verdictOf(
  moved: number,
  span: string,
  before: readonly number[],
): string {
  if (moved === 0) {
    return `Net worth held where it was in ${span}.`;
  }
  return moved < 0
    ? `Net worth fell ${formatGbp(-moved)} in ${span}.`
    : `Net worth rose ${formatGbp(moved)} in ${span}${against(moved, before)}.`;
}

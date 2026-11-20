import type { JSX } from "react";

import { cn } from "cn";
import { ChevronDown, History } from "lucide-react";
import { Fragment } from "react";

import type { KeptPoint, Move, ProgressPoint } from "@/data/progress";

import { DeltaValue } from "@/components/app/atoms/delta-value";
import { KeptNote } from "@/components/app/atoms/kept-note";
import { SegmentBar } from "@/components/app/atoms/segment-bar";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { SectionCard } from "@/components/app/organisms/section-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/kit/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import {
  balances,
  movesOf,
  netWorthOf,
  sharedBy,
  sumOf,
  yearsOf,
} from "@/data/progress";
import {
  balanceFills,
  balanceNames,
  formatBalance,
  partsOf,
} from "@/lib/balances";
import { counted } from "@/lib/count";
import { formatGbp } from "@/lib/money";
import { formatMonthShort, monthsBetween } from "@/lib/months";
import { progress, subsectionLabel } from "@/lib/nav";

interface MoveBarProps {
  readonly moves: readonly Move[];
  readonly scale: Scale;
}

interface ProgressPointsProps {
  readonly points: readonly KeptPoint[];
}

// The most any year added and the most any took away, which every
// year's bar is drawn against, so the years read on one scale.
interface Scale {
  readonly added: number;
  readonly taken: number;
}

// The points year by year, captioned with the months they span and how
// many between were not kept, the newest first and open: each year's row
// says how many months were kept in it where fewer than twelve were,
// draws what each balance added to the right of a rule and what each
// took away to the left of it, on one scale for every year, and gives
// the move in net worth, over the balances both ends of the year carry,
// and where the year ended it, a narrow screen
// laying the bar on a line of its own and leaving where the year ended
// to the months beneath. A year opens to its months,
// newest first, each balance as it was read, a dash for one its point
// was not read with, and net worth beside them, a debt below nothing as
// an account's is; a narrow table folds each
// month to what net worth moved by since the point before it and where
// it ended, a tap opening it to its balances a line apiece, each by a
// dot in its fill, which it keeps where colours are forced, as the
// chart of the same balances keeps its own. A month whose close kept a
// note reads it back on a row of its own beneath the month's, the rule
// between them dropped so the two read as one, in either form, so a
// folded month shows its note unopened, the note spanning the columns
// and sized by them rather than sizing any. A household keeping no
// point yet draws what would fill the card rather than an empty one.
export function ProgressPoints({ points }: ProgressPointsProps): JSX.Element {
  const [first] = points;
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    return (
      <EmptyState
        description="Closing a month on the accounts screen records its point."
        icon={History}
        title="No points yet"
      />
    );
  }
  const years = yearsOf(points).map((kept) => ({
    ...kept,
    moves: movesOf(kept.from, kept.to),
  }));
  const scale = {
    added: Math.max(...years.map(({ moves }) => sumOf(moves, 1))),
    taken: Math.max(...years.map(({ moves }) => sumOf(moves, -1))),
  };
  const newest = years.toReversed();
  return (
    <SectionCard
      caption={`${spanOf(first, last, points.length)}. Added right of the rule, taken away left.`}
      className="pb-0"
      label={subsectionLabel(progress, 2)}
      title="Year by year"
    >
      <Accordion
        className="border-t"
        defaultValue={newest.slice(0, 1).map(({ year }) => String(year))}
      >
        {newest.map(({ from, moves, points: kept, to, year }) => (
          <AccordionItem key={year} value={String(year)}>
            <AccordionTrigger className="items-center gap-3 rounded-none px-4 py-3 font-normal hover:no-underline">
              <span className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[4rem_minmax(0,1fr)_7rem_7rem]">
                <span className="grid">
                  <span className="figure font-medium">{year}</span>
                  {kept.length < 12 && (
                    <span className="text-xs text-muted-foreground">
                      {counted(kept.length, "month")}
                    </span>
                  )}
                </span>
                <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                  <MoveBar moves={moves} scale={scale} />
                </span>
                <span className="text-right">
                  <DeltaValue value={sumOf(moves, 1) - sumOf(moves, -1)} />
                </span>
                <span className="text-right figure max-sm:hidden">
                  {formatGbp(netWorthOf(to))}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <Table>
                <TableHeader className="folded:hidden">
                  <TableRow>
                    <TableHead>Month</TableHead>
                    {balances.map((key) => (
                      <TableHead className="text-right" key={key}>
                        {balanceNames[key]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Net worth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthsOf(from, kept, to).map(({ move, point }) => (
                    <Fragment key={point.month.month}>
                      <TableRow
                        className={
                          point.note === undefined ? undefined : "border-b-0"
                        }
                      >
                        <TableCell className="p-0 whitespace-normal unfolded:hidden">
                          <details className="group">
                            <summary className="flex cursor-pointer items-baseline gap-3 px-4 py-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                              <span className="flex-1 font-medium">
                                {formatMonthShort(point.month)}
                              </span>
                              {move !== undefined && (
                                <DeltaValue value={move} />
                              )}
                              <span className="figure font-medium">
                                {formatGbp(netWorthOf(point))}
                              </span>
                              <ChevronDown
                                aria-hidden
                                className="size-4 self-center text-muted-foreground group-open:rotate-180"
                              />
                            </summary>
                            <ul className="grid gap-1 px-4 pb-3 text-xs text-muted-foreground">
                              {balances.map((key) => (
                                <li
                                  className="flex items-center gap-3"
                                  key={key}
                                >
                                  <span
                                    aria-hidden
                                    className={cn(
                                      "size-2 rounded-full forced-color-adjust-none",
                                      balanceFills[key],
                                    )}
                                  />
                                  <span className="flex-1">
                                    {balanceNames[key]}
                                  </span>
                                  <span className="figure">
                                    {formatBalance(point[key])}
                                  </span>
                                  <span className="size-4" />
                                </li>
                              ))}
                            </ul>
                          </details>
                        </TableCell>
                        <TableCell className="folded:hidden">
                          {formatMonthShort(point.month)}
                        </TableCell>
                        {balances.map((key) => (
                          <TableCell
                            className="text-right figure folded:hidden"
                            key={key}
                          >
                            {formatBalance(point[key])}
                          </TableCell>
                        ))}
                        <TableCell className="text-right figure font-medium folded:hidden">
                          {formatGbp(netWorthOf(point))}
                        </TableCell>
                      </TableRow>
                      {point.note !== undefined && (
                        <TableRow>
                          <TableCell
                            className="pt-0 pb-3 whitespace-normal"
                            colSpan={balances.length + 2}
                          >
                            <KeptNote
                              className="w-0 min-w-full"
                              note={point.note}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </SectionCard>
  );
}

// A year's months, newest first, each with what net worth moved by from
// the point before it, over the balances both ends of the year carry, so
// the months add up to the year's move, the year's first from the point
// the year is read from, unless the year is read from that month itself,
// as the first year is, which then has no move to give.
function monthsOf(
  from: KeptPoint,
  points: readonly KeptPoint[],
  to: KeptPoint,
): { move: number | undefined; point: KeptPoint }[] {
  const over = sharedBy(from, to);
  return points
    .map((point, index) => {
      const prior = points[index - 1] ?? from;
      const moves = movesOf(prior, point, over);
      return {
        move: prior === point ? undefined : sumOf(moves, 1) - sumOf(moves, -1),
        point,
      };
    })
    .toReversed();
}

// A year's moves as a bar across a rule: what took away to its left,
// running out from it, and what added to its right, each side as long
// against the scale as it came to, the two sides as wide as the most
// any year moved them, so the rule stands in one place for every year.
// Hidden from the accessibility tree, since the move is written beside
// it.
function MoveBar({ moves, scale }: MoveBarProps): JSX.Element {
  const added = sumOf(moves, 1);
  const taken = sumOf(moves, -1);
  return (
    <span
      aria-hidden
      className="grid items-center gap-1"
      style={{
        gridTemplateColumns: `minmax(0, ${String(scale.taken)}fr) auto minmax(0, ${String(scale.added)}fr)`,
      }}
    >
      <span className="flex justify-end">
        {taken > 0 && (
          <span
            data-slot="move-bar-side"
            style={{ width: `${String((taken / scale.taken) * 100)}%` }}
          >
            <SegmentBar groups={[partsOf(moves, -1)]} />
          </span>
        )}
      </span>
      <span className="h-5 w-px bg-border" />
      <span>
        {added > 0 && (
          <span
            className="block"
            data-slot="move-bar-side"
            style={{ width: `${String((added / scale.added) * 100)}%` }}
          >
            <SegmentBar groups={[partsOf(moves, 1)]} />
          </span>
        )}
      </span>
    </span>
  );
}

// What the points span, as the card's caption opens on it: how many,
// from the first month to the last, and how many months between were
// not kept, where any were not, the count held to its word so no line
// breaks between them.
function spanOf(
  first: ProgressPoint,
  last: ProgressPoint,
  count: number,
): string {
  const missing = monthsBetween(first.month, last.month) + 1 - count;
  return [
    `${counted(count, "month-end")} from ${formatMonthShort(first.month)} to ${formatMonthShort(last.month)}`,
    ...(missing > 0 ? [`${String(missing)}\u00a0missing`] : []),
  ].join(" · ");
}

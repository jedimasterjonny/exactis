import type { JSX } from "react";

import { History } from "lucide-react";

import type { Move, ProgressPoint } from "@/data/progress";

import { DeltaValue } from "@/components/app/atoms/delta-value";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { SegmentBar } from "@/components/app/atoms/segment-bar";
import { FoldedCell } from "@/components/app/molecules/folded-cell";
import { SectionCard } from "@/components/app/molecules/section-card";
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
import { balances, movesOf, netWorthOf, sumOf, yearsOf } from "@/data/progress";
import { balanceNames, partsOf } from "@/lib/balances";
import { counted } from "@/lib/count";
import { formatGbp } from "@/lib/money";
import { formatMonthShort } from "@/lib/months";
import { progress, subsectionLabel } from "@/lib/nav";

interface MoveBarProps {
  readonly moves: readonly Move[];
  readonly scale: Scale;
}

interface ProgressPointsProps {
  readonly points: readonly ProgressPoint[];
}

// The most any year added and the most any took away, which every
// year's bar is drawn against, so the years read on one scale.
interface Scale {
  readonly added: number;
  readonly taken: number;
}

// The points year by year, the newest first and open: each year's row
// says how many months were kept in it where fewer than twelve were,
// draws what each balance added to the right of a rule and what each
// took away to the left of it, on one scale for every year, and gives
// the move in net worth and where the year ended it, a narrow screen
// laying the bar on a line of its own and leaving where the year ended
// to the months beneath. A year opens to its months,
// newest first, each balance as it was read and net worth beside them,
// a debt below nothing as an account's is; a narrow table folds each
// month to its net worth over its balances. A household keeping no
// point yet draws what would fill the card rather than an empty one.
export function ProgressPoints({ points }: ProgressPointsProps): JSX.Element {
  if (points.length === 0) {
    return (
      <EmptyState
        description="A point is the balances as the Household Finances sheet sums them at the end of a month, loaded into the store."
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
      caption="What each year moved net worth by, balance by balance: what added to the right of the rule and what took away to the left, every year on one scale. Open a year to read its months."
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
                  <DeltaValue value={netWorthOf(to) - netWorthOf(from)} />
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
                  {kept.toReversed().map((point) => (
                    <TableRow key={point.month.month}>
                      <FoldedCell
                        figure={formatGbp(netWorthOf(point))}
                        name={formatMonthShort(point.month)}
                      >
                        <span>
                          {balances
                            .map(
                              (key) =>
                                `${balanceNames[key]} ${formatGbp(point[key])}`,
                            )
                            .join(" · ")}
                        </span>
                      </FoldedCell>
                      <TableCell className="folded:hidden">
                        {formatMonthShort(point.month)}
                      </TableCell>
                      {balances.map((key) => (
                        <TableCell
                          className="text-right figure folded:hidden"
                          key={key}
                        >
                          {formatGbp(point[key])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right figure font-medium folded:hidden">
                        {formatGbp(netWorthOf(point))}
                      </TableCell>
                    </TableRow>
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

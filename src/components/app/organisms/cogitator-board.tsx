"use client";

import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { cn } from "cn";
import { Ban, ChartPie, Flag, FolderSync, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Target, Targets } from "@/data/targets";
import type { Ladder, Rung } from "@/lib/trades";

import { DeltaValue } from "@/components/app/atoms/delta-value";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { MoneyField } from "@/components/app/molecules/figure-field";
import { FoldedCell } from "@/components/app/molecules/folded-cell";
import { SectionCard } from "@/components/app/molecules/section-card";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { Badge } from "@/components/kit/badge";
import { CardContent, CardFooter } from "@/components/kit/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { counted } from "@/lib/count";
import { formatGbp, formatPercent, formatPoints } from "@/lib/money";
import { formatDay } from "@/lib/months";
import {
  assumptions,
  cogitator,
  sectionLabel,
  subsectionLabel,
} from "@/lib/nav";
import { ladderOf, minimumTrade } from "@/lib/trades";

interface CogitatorBoardProps {
  readonly targets: null | Targets;
}

// A rung as the ladder's table lays it: the rung, and how much nearer
// the target it brings the allocation than the rung below it, a
// fraction of the whole.
interface Row {
  readonly closes: number;
  readonly rung: Rung;
}

// What the flag on a category nothing is assigned to says, in the words
// the target allocation flags it in.
const unimplemented = "No fund assigned";

// The next best trades: what to buy, buying only, to bring the
// allocation nearest its targets for the pounds typed in the header.
// The header says when the targets were imported and what they hold in
// all, and takes the amount to invest, which is the screen's own and
// forgotten when it is left, since it is typed afresh at each visit to
// the broker. Beneath, a tile a trade of the rung recommended, the
// largest first and set apart, each saying what it puts into its
// category and where that takes its share; then the ladder, a row a
// count of trades, saying what each count buys, how far off target it
// leaves the allocation and how much nearer it brings it than one
// fewer, with the rung recommended flagged and those past it muted,
// since another trade past it is not worth placing, which the card's
// caption says in pounds; then where the recommended trades leave each
// category against its target. Before the amount is typed the tiles
// and the ladder say so, and the ledger reads as the allocation stands.
// There is nothing to lay out until an allocation is imported, until
// what it holds has been read, which an older import has not, and
// while no category has both a fund and a share to fill, and the
// screen says which, pointing to where the allocation is imported.
export function CogitatorBoard({ targets }: CogitatorBoardProps): JSX.Element {
  const [amount, setAmount] = useState(0);
  const categories = targets?.categories ?? [];
  const held = categories.reduce((sum, { value }) => sum + value, 0);
  const isReady =
    held > 0 &&
    categories.some(({ isImplemented, share }) => isImplemented && share > 0);
  return (
    <>
      <ScreenHeader
        actions={
          isReady ? (
            <MoneyField
              defaultValue={0}
              label="Amount to invest"
              min={0}
              onValueCommitted={setAmount}
            />
          ) : undefined
        }
        label={sectionLabel(cogitator)}
        title={cogitator.title}
      >
        {targets === null ? (
          "Buys only, toward the target allocation"
        ) : (
          <>
            <Badge variant="secondary">
              <FolderSync aria-hidden />
              {`Imported ${formatDay(targets.importedOn)}`}
            </Badge>
            {`${formatGbp(held)} held`}
          </>
        )}
      </ScreenHeader>
      <ScreenBody>
        {targets === null && (
          <Unready
            description="Import a Portfolio Performance file to read the targets and what each category holds."
            icon={ChartPie}
            title="No allocation imported yet"
          />
        )}
        {targets !== null && held === 0 && (
          <Unready
            description="Reload the Portfolio Performance file to read what each category holds, which an older import did not."
            icon={FolderSync}
            title="Nothing held yet"
          />
        )}
        {targets !== null && held > 0 && !isReady && (
          <Unready
            description="No category has both a fund assigned and a share of the whole to fill."
            icon={Ban}
            title="Nothing to buy toward"
          />
        )}
        {isReady && (
          <Trades amount={amount} categories={categories} held={held} />
        )}
      </ScreenBody>
    </>
  );
}

// What a rung buys, as a line: each category and the pounds put into
// it, or a dash for the rung of no trade.
function buysOf(rung: Rung): string {
  return rung.count === 0
    ? "—"
    : rung.trades
        .map(({ category, pounds }) => `${category.name} ${formatGbp(pounds)}`)
        .join(" · ");
}

// What a rung is called: no trade, or its count of trades.
function nameOf(rung: Rung): string {
  return rung.count === 0 ? "No trade" : counted(rung.count, "trade");
}

// Why the rung recommended is the one: before an amount is typed, that
// it is to be; otherwise the count, and what the rung above would do,
// put less than the minimum into one category, named with the pounds,
// or buy nothing at all, every other category holding its target or
// more.
function reasonOf({ recommended, rungs }: Ladder, amount: number): string {
  if (amount <= 0) {
    return "Type the amount to invest to lay the trades out.";
  }
  const opening =
    recommended.count === 0 ? "No trade" : counted(recommended.count, "trade");
  const next = rungs.find((rung) => rung.count === recommended.count + 1);
  if (next === undefined) {
    return `${opening}. Trade ${String(recommended.count + 1)} would buy nothing: every other category holds its target or more.`;
  }
  const least = next.trades.reduce((smallest, trade) =>
    trade.pounds < smallest.pounds ? trade : smallest,
  );
  return `${opening}. Trade ${String(next.count)} would put only ${formatGbp(least.pounds)} into ${least.category.name}, under the ${formatGbp(minimumTrade)} minimum.`;
}

// The ladder's rows, each with how much nearer the target it brings the
// allocation than the rung below: nothing for the rung of no trade.
function rowsOf(ladder: Ladder): readonly Row[] {
  const rows: Row[] = [];
  let before: number | undefined;
  for (const rung of ladder.rungs) {
    rows.push({ closes: before === undefined ? 0 : before - rung.drift, rung });
    before = rung.drift;
  }
  return rows;
}

// The tiles, the ladder and the ledger over an allocation that can be
// bought toward, for the amount typed.
function Trades({
  amount,
  categories,
  held,
}: {
  readonly amount: number;
  readonly categories: readonly Target[];
  readonly held: number;
}): JSX.Element {
  const ladder = ladderOf(categories, amount);
  const { recommended } = ladder;
  const bought = recommended.trades.reduce(
    (sum, { pounds }) => sum + pounds,
    0,
  );
  const total = held + bought;
  const reason = reasonOf(ladder, amount);
  return (
    <>
      <TileGrid>
        {recommended.count === 0 ? (
          <StatTile
            caption={reason}
            label="No trade"
            tone="inverse"
            value="—"
          />
        ) : (
          recommended.trades.map(({ category, pounds }, at) => (
            <StatTile
              caption={`${formatPercent(category.value / held)} → ${formatPercent((category.value + pounds) / total)} of ${formatPercent(category.share)}`}
              key={category.id}
              label={category.name}
              tone={at === 0 ? "inverse" : "default"}
              value={formatGbp(pounds)}
            />
          ))
        )}
      </TileGrid>
      <SectionCard
        caption={reason}
        label={subsectionLabel(cogitator, 1)}
        title="How many trades"
      >
        <Table>
          <TableHeader className="folded:hidden">
            <TableRow>
              <TableHead>Trades</TableHead>
              <TableHead>Buys</TableHead>
              <TableHead className="text-right">Off target</TableHead>
              <TableHead className="text-right">Closes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsOf(ladder).map(({ closes, rung }) => {
              const isRecommended = rung === recommended;
              const drift = formatPoints(rung.drift, 2);
              return (
                <TableRow
                  className={cn(
                    rung.count > recommended.count && "text-muted-foreground",
                  )}
                  key={rung.count}
                >
                  <FoldedCell figure={drift} name={nameOf(rung)}>
                    {isRecommended && <span>Recommended</span>}
                    <span>{buysOf(rung)}</span>
                    <span>
                      Closes <DeltaValue format="points" value={closes * 100} />
                    </span>
                  </FoldedCell>
                  <TableCell className="folded:hidden">
                    <span className="flex flex-wrap items-center gap-3">
                      {nameOf(rung)}
                      {isRecommended && (
                        <Badge variant="positive">
                          <Flag aria-hidden />
                          Recommended
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal folded:hidden">
                    {buysOf(rung)}
                  </TableCell>
                  <TableCell className="text-right figure folded:hidden">
                    {drift}
                  </TableCell>
                  <TableCell className="text-right folded:hidden">
                    <DeltaValue format="points" value={closes * 100} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <CardFooter className="text-sm text-muted-foreground">
          {`Off target is the root mean square of every category's gap from its target. A trade is worth placing for ${formatGbp(minimumTrade)} or more, so the rung recommended is the last whose smallest trade is.`}
        </CardFooter>
      </SectionCard>
      <SectionCard
        label={subsectionLabel(cogitator, 2)}
        title="Where it leaves the allocation"
      >
        <Table>
          <TableHeader className="folded:hidden">
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Holds</TableHead>
              <TableHead className="text-right">Now</TableHead>
              <TableHead className="text-right">Buy</TableHead>
              <TableHead className="text-right">After</TableHead>
              <TableHead className="text-right">Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => {
              const trade = recommended.trades.find(
                (each) => each.category.id === category.id,
              );
              const pounds = trade?.pounds ?? 0;
              const now = formatPercent(category.value / held);
              const after = formatPercent((category.value + pounds) / total);
              const target = formatPercent(category.share);
              const buy = trade === undefined ? "—" : formatGbp(pounds);
              const isFlagged = category.share > 0 && !category.isImplemented;
              return (
                <TableRow key={category.id}>
                  <FoldedCell
                    figure={buy}
                    isFigureMuted={trade === undefined}
                    name={category.name}
                  >
                    {isFlagged && <span>{unimplemented}</span>}
                    <span>{`Holds ${formatGbp(category.value)} · ${now} → ${after} of ${target}`}</span>
                  </FoldedCell>
                  <TableCell className="folded:hidden">
                    <span className="flex flex-wrap items-center gap-3">
                      {category.name}
                      {isFlagged && (
                        <Badge
                          className="text-muted-foreground"
                          variant="outline"
                        >
                          <TriangleAlert aria-hidden />
                          {unimplemented}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right figure folded:hidden">
                    {formatGbp(category.value)}
                  </TableCell>
                  <TableCell className="text-right figure folded:hidden">
                    {now}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right figure folded:hidden",
                      trade === undefined
                        ? "text-muted-foreground"
                        : "font-medium",
                    )}
                  >
                    {buy}
                  </TableCell>
                  <TableCell className="text-right figure folded:hidden">
                    {after}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right figure folded:hidden",
                      category.share === 0 && "text-muted-foreground",
                    )}
                  >
                    {target}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionCard>
    </>
  );
}

// The screen with nothing to lay out, saying why where the ladder
// would be, and where the allocation is imported.
function Unready({
  description,
  icon,
  title,
}: {
  readonly description: string;
  readonly icon: LucideIcon;
  readonly title: string;
}): JSX.Element {
  return (
    <SectionCard label={subsectionLabel(cogitator, 1)} title="How many trades">
      <CardContent>
        <EmptyState description={description} icon={icon} title={title}>
          <Link
            className="underline underline-offset-4"
            href={assumptions.href}
          >
            {`${assumptions.label} › Target allocation`}
          </Link>
        </EmptyState>
      </CardContent>
    </SectionCard>
  );
}

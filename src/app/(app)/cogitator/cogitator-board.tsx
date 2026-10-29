"use client";

import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { cn } from "cn";
import { Ban, ChartPie, Flag, FolderSync, TriangleAlert } from "lucide-react";
import Link from "next/link";

import type { Target, Targets } from "@/data/targets";
import type { Ladder, Rung } from "@/lib/trades";

import { DeltaValue } from "@/components/app/atoms/delta-value";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { Caution } from "@/components/app/molecules/caution";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { FoldedCell } from "@/components/app/organisms/folded-cell";
import { SectionCard } from "@/components/app/organisms/section-card";
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
import {
  formatGbp,
  formatPercent,
  formatPoints,
  formatWholePercent,
} from "@/lib/money";
import { assumptions, cogitator, subsectionLabel } from "@/lib/nav";
import { ladderOf, minimumTrade } from "@/lib/trades";

interface CogitatorBoardProps {
  readonly amount: number;
  readonly bonds?: { readonly now: number; readonly targeted: number };
  readonly held: number;
  readonly isReady: boolean;
  readonly sales: number;
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

// The next best trades: what to buy, and to sell up to the count of
// sales typed, to bring the allocation nearest its targets for the
// pounds typed in the header. The screen holds the amount and the
// sales and hands them down, with what the allocation holds in all
// and whether any of it can be bought toward. Beneath, a tile a trade
// of the rung recommended, the purchases first, the largest set
// apart, each saying what it puts into or takes out of its category
// and where that takes its share; then the ladder, a row a count of
// trades, saying what each count buys and sells, how far off target
// it leaves the allocation and how much nearer it brings it than the
// rung before it, which with sales may make two fewer trades, or
// stand nearer, with the rung recommended flagged and those past it
// or with a trade under the minimum muted, since neither is worth
// placing, which the card's caption says in pounds once one is
// recommended; then where the recommended trades leave each category
// against its target. A sale is written in pounds below nothing.
// Before an amount or a sale is typed the tile says so, and the
// ledger reads as the allocation stands.
// While the plan holds a share in bonds now other than the target
// allocation's, as one retargeted from a fund all in equities leaves it
// once the glide path reaches bonds, a caution above everything says
// both, since every trade then buys toward a split the plan no longer
// holds; there is none unless the two are given.
// There is nothing to lay out until an allocation is imported, until
// what it holds has been read, which an older import has not, and
// while no category has both a fund and a share to fill, and the
// screen says which, pointing to where the allocation is imported.
export function CogitatorBoard({
  amount,
  bonds,
  held,
  isReady,
  sales,
  targets,
}: CogitatorBoardProps): JSX.Element {
  return (
    <>
      {bonds !== undefined && (
        <Caution
          title={`The target allocation holds ${formatWholePercent(bonds.targeted)} in bonds; the plan holds ${formatWholePercent(bonds.now)} now`}
        >
          {`The trades buy toward the target allocation's split. Retarget on ${assumptions.label} › Target allocation to buy toward the plan's.`}
        </Caution>
      )}
      {targets === null && (
        <Unready
          description="Import a Portfolio Performance file."
          icon={ChartPie}
          title="No allocation imported yet"
        />
      )}
      {targets !== null && held === 0 && (
        <Unready
          description="Reload the Portfolio Performance file."
          icon={FolderSync}
          title="Nothing held yet"
        />
      )}
      {targets !== null && held > 0 && !isReady && (
        <Unready
          description="No category has both a fund and a target."
          icon={Ban}
          title="Nothing to buy toward"
        />
      )}
      {targets !== null && isReady && (
        <Trades
          amount={amount}
          categories={targets.categories}
          held={held}
          sales={sales}
        />
      )}
    </>
  );
}

// What a rung trades, as a line: each category and the pounds put into
// it, or taken out of it below nothing, or a dash for the rung of no
// trade.
function lineOf(rung: Rung): string {
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

// Why the rung recommended is the one: before an amount or a sale is
// typed, that one is to be; otherwise the count, and what the next rung
// up would do: put less than the minimum into one category, or take
// less than it out of one, named with the pounds, or else bring the
// allocation no nearer, as a trade that moves nothing does.
function reasonOf(
  { recommended, rungs }: Ladder,
  amount: number,
  sales: number,
): string {
  if (amount <= 0 && sales === 0) {
    return "Type an amount to invest.";
  }
  const opening =
    recommended.count === 0 ? "No trade" : counted(recommended.count, "trade");
  const next = rungs.find((rung) => rung.count > recommended.count);
  const trade = String(next?.count ?? recommended.count + 1);
  const least = next?.trades.reduce((smallest, each) =>
    Math.abs(each.pounds) < Math.abs(smallest.pounds) ? each : smallest,
  );
  if (least === undefined || Math.abs(least.pounds) >= minimumTrade) {
    return `${opening}. Trade ${trade} would bring it no nearer.`;
  }
  const what =
    least.pounds > 0
      ? `put only ${formatGbp(least.pounds)} into`
      : `sell only ${formatGbp(-least.pounds)} of`;
  return `${opening}. Trade ${trade} would ${what} ${least.category.name}, under the ${formatGbp(minimumTrade)} minimum.`;
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
// bought toward, for the amount and the sales typed.
function Trades({
  amount,
  categories,
  held,
  sales,
}: {
  readonly amount: number;
  readonly categories: readonly Target[];
  readonly held: number;
  readonly sales: number;
}): JSX.Element {
  const ladder = ladderOf(categories, amount, { sales });
  const { recommended } = ladder;
  const bought = recommended.trades.reduce(
    (sum, { pounds }) => sum + pounds,
    0,
  );
  const total = held + bought;
  const reason = reasonOf(ladder, amount, sales);
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
        {...(recommended.count > 0 && { caption: reason })}
        label={subsectionLabel(cogitator, 1)}
        title="How many trades"
      >
        <Table>
          <TableHeader className="folded:hidden">
            <TableRow>
              <TableHead>Trades</TableHead>
              <TableHead>Buys and sales</TableHead>
              <TableHead className="text-right">Off target</TableHead>
              <TableHead className="text-right">Closes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsOf(ladder).map(({ closes, rung }) => {
              const isRecommended = rung === recommended;
              const drift = formatPoints(rung.drift, 2);
              const isUnder = rung.trades.some(
                ({ pounds }) => Math.abs(pounds) < minimumTrade,
              );
              return (
                <TableRow
                  className={cn(
                    (rung.count > recommended.count || isUnder) &&
                      "text-muted-foreground",
                  )}
                  key={rung.count}
                >
                  <FoldedCell figure={drift} name={nameOf(rung)}>
                    {isRecommended && <span>Recommended</span>}
                    <span>{lineOf(rung)}</span>
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
                    {lineOf(rung)}
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
          {`Off target is the root mean square of the gaps from target. Each trade is at least ${formatGbp(minimumTrade)}.`}
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
              <TableHead className="text-right">Trade</TableHead>
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

"use client";

import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import type { JSX } from "react";

import { cn } from "cn";
import {
  ArrowUpRight,
  Ban,
  ChartPie,
  FolderSync,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import type { PortfolioHandoff } from "@/data/portfolio";
import type { Target, Targets } from "@/data/targets";
import type { Ladder, Rung } from "@/lib/trades";

import { DeltaValue } from "@/components/app/atoms/delta-value";
import { PortfolioSync } from "@/components/app/atoms/portfolio-sync";
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
import { listed } from "@/lib/feeders";
import {
  formatGbp,
  formatPercent,
  formatPoints,
  formatWholePercent,
} from "@/lib/money";
import {
  assumptions,
  cogitator,
  portfolio as portfolioScreen,
  subsectionLabel,
} from "@/lib/nav";
import { ladderOf, minimumTrade } from "@/lib/trades";

import type { CogitatorPortfolio } from "./cogitator-screen";

interface CogitatorBoardProps {
  readonly account: string;
  readonly amount: number;
  readonly bonds?: { readonly now: number; readonly targeted: number };
  readonly branch: null | string;
  readonly held: number;
  readonly isReady: boolean;
  readonly portfolio: CogitatorPortfolio | null;
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
// pounds typed in the header, the trades placed in the securities
// account chosen there, so each sale is held to what that account
// holds of its category, or to what every account holds of it until
// one is chosen; the allocation is measured whole all the same. The
// screen holds the amount, the sales and the account, all accounts
// being the one of no name, and hands them down, with what the
// allocation holds in all and whether any of it can be bought toward.
// Beneath, a tile a trade of the rung recommended, the purchases
// first, the largest set apart, each saying what it puts into or
// takes out of its category, where that takes its share, and — outside
// a scenario when an owned portfolio file is stored — a handoff link
// to record the trade on Portfolio; then the ladder, a row a count of
// trades, saying what each count buys and sells, how far off target it
// leaves the allocation and how much nearer it brings it than the rung
// before it, which with sales may make two fewer trades, or stand
// nearer, with the rung recommended saying so and those past it or
// with a trade under the minimum muted, since neither is worth
// placing, which the card's caption says in pounds once one is
// recommended; then where the recommended trades leave each category
// against its target. A sale is written in pounds below nothing.
// Before an amount or a sale is typed the tile says so, and the ledger
// reads as the allocation stands.
// When the household's owned portfolio file has refused or unsynced
// targets beside saved ones (outside a scenario for unsynced updates),
// a caution above the board explains the state and offers a sync
// button (disabled with the live-CMA blocker when applicable).
// While the plan holds a share in bonds now other than the target
// allocation's, as one retargeted from a fund all in equities leaves it
// once the glide path reaches bonds, a caution above everything says
// both, since every trade then buys toward a split the plan no longer
// holds; there is none unless the two are given.
// There is nothing to lay out until an allocation is synced, until
// what it holds has been read, and while no category has both a fund
// and a share to fill, and the screen says which, pointing to
// Portfolio or Assumptions › Target allocation, or offering to sync
// inline.
export function CogitatorBoard({
  account,
  amount,
  bonds,
  branch,
  held,
  isReady,
  portfolio,
  sales,
  targets,
}: CogitatorBoardProps): JSX.Element {
  const isInScenario = branch !== null;
  return (
    <>
      {portfolio !== null && targets !== null && (
        <PortfolioCaution branch={branch} portfolio={portfolio} />
      )}
      {bonds !== undefined && (
        <Caution
          title={`The target allocation holds ${formatWholePercent(bonds.targeted)} in bonds; the plan holds ${formatWholePercent(bonds.now)} now`}
        >
          {`The trades buy toward the target allocation's split. Retarget on ${assumptions.label} › Target allocation to buy toward the plan's.`}
        </Caution>
      )}
      {targets !== null && isReady ? (
        <Trades
          account={account}
          amount={amount}
          categories={targets.categories}
          handoff={
            isInScenario || portfolio === null ? null : portfolio.handoff
          }
          held={held}
          sales={sales}
        />
      ) : (
        <UnreadyBoard
          branch={branch}
          held={held}
          portfolio={portfolio}
          targets={targets}
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

// Caution shown above the board when saved targets exist alongside an
// owned portfolio file whose targets are refused or (outside a
// scenario) unsynced.
function PortfolioCaution({
  branch,
  portfolio,
}: {
  readonly branch: null | string;
  readonly portfolio: CogitatorPortfolio;
}): JSX.Element | null {
  const syncCautionId = useId();
  switch (portfolio.syncState) {
    case "refused":
      return (
        <Caution title="Portfolio file could not be synced">
          {portfolio.syncRefusal}
        </Caution>
      );
    case "retargeted":
    case "synced":
      return null;
    case "unsynced":
      if (branch !== null) {
        return null;
      }
      return (
        <Caution
          action={
            <PortfolioSync
              branch={branch}
              {...(portfolio.blockedReason !== undefined && {
                describedBy: syncCautionId,
                isDisabled: true,
              })}
            />
          }
          id={syncCautionId}
          title={
            portfolio.blockedReason !== undefined
              ? "Portfolio file has unsynced changes"
              : "Portfolio file has newer targets or holdings"
          }
        >
          {portfolio.blockedReason ??
            "Sync from Portfolio to plan trades from the latest file."}
        </Caution>
      );
  }
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

// What a screen reader is told of the tiles: the rung recommended and
// what each of its trades puts into or takes out of its category, or,
// with no trade, the No-trade tile's own caption, opening on its name
// where the caption does not.
function saidOf({ recommended }: Ladder, reason: string): string {
  if (recommended.count === 0) {
    return reason.startsWith("No trade") ? reason : `No trade. ${reason}`;
  }
  const trades = recommended.trades.map(({ category, pounds }) =>
    pounds > 0
      ? `${formatGbp(pounds)} into ${category.name}`
      : `${formatGbp(-pounds)} out of ${category.name}`,
  );
  return `${nameOf(recommended)}: ${listed.format(trades)}.`;
}

// Builds the Portfolio transactions handoff URL for one recommended
// trade: whole-pound positive amount, purchase/sale type, unique
// account UUID when a named account resolves unambiguously, and either
// a single resolved security UUID (narrowed to held securities across
// the matching accounts for sales) or the Asset Allocation category id
// when multiple or none match.
function tradeHandoffHref(
  trade: { readonly category: Target; readonly pounds: number },
  account: string,
  handoff: PortfolioHandoff,
): Route {
  const type = trade.pounds > 0 ? "purchase" : "sale";
  const params = new URLSearchParams({
    amount: String(Math.abs(trade.pounds)),
    tab: "transactions",
    trade: type,
  });
  const matchingAccounts =
    account === ""
      ? []
      : handoff.securitiesAccounts.filter((item) => item.name === account);
  const [onlyAccount, secondAccount] = matchingAccounts;
  const portfolioId =
    onlyAccount !== undefined && secondAccount === undefined
      ? onlyAccount.id
      : undefined;
  if (portfolioId !== undefined) {
    params.set("portfolio", portfolioId);
  }
  const assigned =
    new Map(Object.entries(handoff.securitiesByCategory)).get(
      trade.category.id,
    ) ?? [];
  let candidates = assigned;
  if (type === "sale") {
    const scopedAccountIds = new Set(matchingAccounts.map((item) => item.id));
    const heldInScope =
      scopedAccountIds.size > 0
        ? assigned.filter((item) =>
            item.heldInAccountIds.some((id) => scopedAccountIds.has(id)),
          )
        : assigned.filter((item) => item.heldInAccountIds.length > 0);
    candidates = heldInScope.length > 0 ? heldInScope : assigned;
  }
  const [onlySecurity, secondSecurity] = candidates;
  if (onlySecurity !== undefined && secondSecurity === undefined) {
    params.set("security", onlySecurity.id);
  } else {
    params.set("category", trade.category.id);
  }
  return `${portfolioScreen.href}?${params.toString()}`;
}

// The tiles, the ladder and the ledger over an allocation that can be
// bought toward, for the amount and the sales typed and the account
// chosen; and a status saying what the tiles lay, empty from the first
// paint and holding their words once any of the three is committed
// afresh, so a screen reader hears the trades laid anew but nothing as
// the screen opens. Unseen, and out of the flow, so it moves nothing.
function Trades({
  account,
  amount,
  categories,
  handoff,
  held,
  sales,
}: {
  readonly account: string;
  readonly amount: number;
  readonly categories: readonly Target[];
  readonly handoff: null | PortfolioHandoff;
  readonly held: number;
  readonly sales: number;
}): JSX.Element {
  const ladder = ladderOf(categories, amount, {
    sales,
    sellable: (category) =>
      account === ""
        ? category.value
        : (category.accounts?.find(({ name }) => name === account)?.value ?? 0),
  });
  const { recommended } = ladder;
  const bought = recommended.trades.reduce(
    (sum, { pounds }) => sum + pounds,
    0,
  );
  const total = held + bought;
  const reason = reasonOf(ladder, amount, sales);
  const laid = JSON.stringify([account, amount, sales]);
  const [opened] = useState(laid);
  const [isRelaid, setIsRelaid] = useState(false);
  if (laid !== opened && !isRelaid) {
    setIsRelaid(true);
  }
  return (
    <>
      <p className="sr-only" role="status">
        {isRelaid ? saidOf(ladder, reason) : ""}
      </p>
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
              {...(handoff !== null && {
                footer: (
                  <Link
                    aria-label={`Record ${pounds > 0 ? "purchase" : "sale"} of ${category.name} in Portfolio`}
                    className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-card-foreground underline decoration-current/60 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:-mb-2.5 pointer-coarse:min-h-11"
                    href={tradeHandoffHref(
                      { category, pounds },
                      account,
                      handoff,
                    )}
                  >
                    {pounds > 0 ? "Record purchase" : "Record sale"}
                    <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
                  </Link>
                ),
              })}
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
                        <Badge variant="positive">Recommended</Badge>
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
// would be and offering the next action.
function Unready({
  action,
  description,
  icon,
  title,
}: {
  readonly action: JSX.Element;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly title: string;
}): JSX.Element {
  return (
    <SectionCard label={subsectionLabel(cogitator, 1)} title="How many trades">
      <CardContent>
        <EmptyState description={description} icon={icon} title={title}>
          {action}
        </EmptyState>
      </CardContent>
    </SectionCard>
  );
}

// Chooses the unready empty state when no allocation is ready to trade
// toward: missing file, refused file, unsynced targets, zero holdings,
// or no implemented category with a positive share.
function UnreadyBoard({
  branch,
  held,
  portfolio,
  targets,
}: {
  readonly branch: null | string;
  readonly held: number;
  readonly portfolio: CogitatorPortfolio | null;
  readonly targets: null | Targets;
}): JSX.Element {
  if (targets === null) {
    if (portfolio === null) {
      return (
        <Unready
          action={
            <UnreadyLink
              href={portfolioScreen.href}
              label="Upload on Portfolio"
            />
          }
          description="Upload a binary Portfolio Performance file on Portfolio to plan trades."
          icon={ChartPie}
          title="No portfolio file uploaded yet"
        />
      );
    }
    if (portfolio.syncState === "refused") {
      return (
        <Unready
          action={
            <UnreadyLink href={portfolioScreen.href} label="Open Portfolio" />
          }
          description={portfolio.syncRefusal}
          icon={ChartPie}
          title="Portfolio file could not be synced"
        />
      );
    }
    return (
      <Unready
        action={<PortfolioSync branch={branch} variant="default" />}
        description="Sync the stored portfolio file to plan trades."
        icon={ChartPie}
        title="No allocation synced yet"
      />
    );
  }
  if (held === 0) {
    return (
      <Unready
        action={
          <UnreadyLink href={portfolioScreen.href} label="Open Portfolio" />
        }
        description="Record holdings or update quotes on Portfolio."
        icon={FolderSync}
        title="Nothing held yet"
      />
    );
  }
  return (
    <Unready
      action={
        <UnreadyLink
          href={`${assumptions.href}?tab=target-allocation`}
          label={`${assumptions.label} › Target allocation`}
        />
      }
      description="No category has both a fund and a target."
      icon={Ban}
      title="Nothing to buy toward"
    />
  );
}

// An unready link sized at least 44px tall on a touch screen.
function UnreadyLink({
  href,
  label,
}: {
  readonly href: Route;
  readonly label: string;
}): JSX.Element {
  return (
    <Link
      className="underline underline-offset-4 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
      href={href}
    >
      {label}
    </Link>
  );
}

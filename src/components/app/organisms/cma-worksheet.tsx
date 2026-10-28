"use client";

import type { JSX, ReactNode } from "react";

import { cn } from "cn";
import { ChartPie, Sheet } from "lucide-react";
import { useId } from "react";

import type { WorksheetRow } from "@/components/app/atoms/worksheet";
import type {
  Blend,
  Cma,
  Deductions,
  Mapping,
  Sleeve,
  Vintages,
} from "@/data/cma";
import type { Curve } from "@/data/inflation";
import type { Before, Moves, Source } from "@/data/moves";
import type { Across, Allocation } from "@/data/rates";
import type { Targets } from "@/data/targets";

import { Caution } from "@/components/app/atoms/caution";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { Note } from "@/components/app/atoms/note";
import { Worksheet } from "@/components/app/atoms/worksheet";
import { CardContent } from "@/components/kit/card";
import { blendsOf, cmaRates, heldAt, rebalancingOf, riskOf } from "@/data/cma";
import { inflationOf } from "@/data/inflation";
import { movesBetween } from "@/data/moves";
import { resultsOf } from "@/data/rates";
import { listed } from "@/lib/feeders";
import { formatCurveRate, formatPercent, formatPoints } from "@/lib/money";
import { formatDay } from "@/lib/months";

interface CmaWorksheetProps {
  readonly before: Before | null;
  readonly cma: null | Vintages;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly fields: ReactNode;
  readonly mappings: readonly Mapping[];
  readonly split: Allocation | null;
  readonly targets: null | Targets;
}

// What each sleeve is headed as, in the worksheet's columns and over its
// weights.
const headings: Record<Sleeve, string> = { bonds: "Bonds", stocks: "Stocks" };

// The worksheet's columns: each sleeve, then the portfolio they make.
const columns = [headings.stocks, headings.bonds, "Portfolio"] as const;

// What each source is named as in the rows of what moved the rates.
const sourceNames: Record<Source, string> = {
  cma: "BlackRock CMA",
  curve: "BoE curve",
  deductions: "Fees and yield",
  targets: "Target allocation",
};

// The body of the rates card while the CMA-derived rates are live: the
// latest vintage of BlackRock's capital market assumptions worked out
// into the rates the plan runs on, one worksheet a column a sleeve and
// one for the portfolio, so every figure is shown once and checks down
// and across.
//
// The fields the two deductions are typed in are given, and set at its
// head: the fee drag off both sleeves and the dividend yield split out
// of stocks, since BlackRock's index returns carry no fees and its
// workbook no yields. They are typed into the card rather than here, so
// they can be typed under either set of rates, and the deductions
// given are the ones they show, so the worksheet follows a deduction as
// it is typed.
//
// Beneath, the worksheet: the target weight of each sleeve, the blended
// 20-year return, the hedging adjustment where a class is hedged to
// sterling, the fees, and what rebalancing earns over the blend where
// the vintage gives the risk to work it from, closing on the return each
// comes to, which for the portfolio is the plan rate; then the growth
// and the yield that return is made of, which are the rates the plan
// takes, and what it comes to over the curve's inflation. The
// portfolio's figure in each row is the sleeves' in the shares the
// target allocation holds of them, but for the rebalancing, which the
// portfolio earns between the sleeves as well as within each, so its
// return stands over the sleeves' weighted by as much. A sleeve nothing
// blends into is dashed, unless a class stands in for it, as one can for
// bonds, when it is worked out at that class. Under the worksheet, every
// category's share of the whole, under the sleeve it blends into.
// Beneath the worksheet, what has moved the rates since the household
// as it stood a while ago, given as its sources then: the plan rate, the
// inflation and the real return then, a row for each source that has
// changed since, with how far it moved each, and the three as they are
// now, so the rows add up down the columns. A source that changed and
// moved nothing still has its row, and where nothing has changed the
// section says so. It follows the deductions as they are typed, as the
// worksheet does. Where the sources then derive no rates, or a source
// taken on the way leaves none, there is nothing to compare, and the
// section is left out.
//
// While a glide path sets the split, the split given is the one it
// holds now, and the worksheet holds the sleeves in it rather than in
// the target allocation's shares, as the plan does: the weights, the
// portfolio's figures and the rebalancing between the sleeves are its,
// each sleeve still blended from the target allocation within itself,
// so the portfolio's return is the plan rate the plan grows at now.
// Each category's share of the whole is scaled with its sleeve's, and
// what moved the rates is read at the same split.
//
// Before a vintage is pulled, or a target allocation imported on its
// tab, there is nothing to work out, and the body says so; while the
// vintage makes no blend, it says what is missing in the caution tone.
export function CmaWorksheet({
  before,
  cma,
  curve,
  deductions,
  fields,
  mappings,
  split,
  targets,
}: CmaWorksheetProps): JSX.Element {
  const moves =
    before === null
      ? null
      : movesBetween(
          before.sources,
          { cma, curve, deductions, mappings, targets },
          split,
        );
  return (
    <>
      <CardContent className="grid gap-8">
        {fields}
        {cma === null && (
          <EmptyState
            description="Pull BlackRock's workbook."
            icon={Sheet}
            title="No CMA pulled yet"
          />
        )}
        {cma !== null && targets === null && (
          <EmptyState
            description="Import one on the Target allocation tab."
            icon={ChartPie}
            title="No allocation imported yet"
          />
        )}
        {cma !== null && targets !== null && (
          <Blended
            cma={cma.latest}
            curve={curve}
            deductions={deductions}
            mappings={mappings}
            split={split}
            targets={targets}
          />
        )}
        {moves !== null && before !== null && (
          <Moved moves={moves} since={before.savedOn} />
        )}
      </CardContent>
    </>
  );
}

// The latest vintage worked out by the target allocation, held in the
// glide path's split now where one is given, with the weights it is
// worked out by beneath, or what keeps it from being blended.
function Blended({
  cma,
  curve,
  deductions,
  mappings,
  split,
  targets,
}: {
  readonly cma: Cma;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly mappings: readonly Mapping[];
  readonly split: Allocation | null;
  readonly targets: Targets;
}): JSX.Element {
  const blends = blendsOf(cma, targets, mappings);
  if ("short" in blends) {
    return (
      <Caution title="The CMA cannot be blended yet">
        {`${blends.short}. Fix it on the Target allocation tab.`}
      </Caution>
    );
  }
  const held = split === null ? blends : heldAt(blends, split);
  const scaleOf = (sleeve: Sleeve): number =>
    blends[sleeve].share === 0 ? 0 : held[sleeve].share / blends[sleeve].share;
  return (
    <>
      <Worksheet
        columns={columns}
        label="CMA-derived rates, worked out"
        rows={rowsOf(held, {
          cma,
          curve,
          deductions,
          weight: split === null ? "Target weight" : "Glide path weight",
        })}
      />
      <Weights
        cma={cma}
        heading={split === null ? "Target weights" : "Glide path weights"}
        mappings={mappings}
        scale={{ bonds: scaleOf("bonds"), stocks: scaleOf("stocks") }}
        targets={targets}
      />
    </>
  );
}

// What moved the rates since the day given, as a worksheet that adds up
// down its columns, or a note that nothing has.
function Moved({
  moves,
  since,
}: {
  readonly moves: Moves;
  readonly since: string;
}): JSX.Element {
  const id = useId();
  const day = formatDay(since);
  const points = ({ inflation, planRate, real }: Moves["now"]): string[] =>
    [planRate, inflation, real].map((figure) => formatPoints(figure, 2));
  const percents = ({ inflation, planRate, real }: Moves["now"]): string[] =>
    [planRate, inflation, real].map((figure) => formatPercent(figure));
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <h3 className="label text-muted-foreground" id={id}>
        {`What moved since ${day}`}
      </h3>
      {moves.steps.length === 0 ? (
        <Note>{`Nothing has moved the rates since ${day}.`}</Note>
      ) : (
        <Worksheet
          columns={["Plan rate", "Inflation", "Real return"]}
          label="What moved the rates, worked out"
          rows={[
            { figures: percents(moves.before), label: "Then" },
            ...moves.steps.map(({ by, sources }) => ({
              figures: points(by),
              label: listed.format(sources.map((one) => sourceNames[one])),
            })),
            { figures: percents(moves.now), isResult: true, label: "Now" },
          ]}
        />
      )}
    </section>
  );
}

// The worksheet's rows, from the weights to the real return, the
// weights named as the caller names them. Each sleeve's figure is
// dashed where nothing blends into it and nothing stands in for it, and
// the portfolio's is the sleeves' in the shares the blends are held in,
// which leaves out the sleeve that holds none. The hedging row is there
// only while a sleeve held has a class hedged to sterling, and dashed for
// a sleeve with none hedged or none held, since one held at nothing
// moves nothing. The rebalancing row is there only while the vintage
// gives the risk it is worked from, and without it the return is the
// blend alone, as the plan then runs. Bonds pay no yield, so theirs is
// dashed.
// Before a curve is pulled there is no inflation to read the return
// over, and the real return is dashed.
function rowsOf(
  blends: { readonly bonds: Blend; readonly stocks: Blend },
  {
    cma,
    curve,
    deductions,
    weight,
  }: {
    readonly cma: Cma;
    readonly curve: Curve | null;
    readonly deductions: Deductions;
    readonly weight: string;
  },
): readonly WorksheetRow[] {
  const { bonds, stocks } = blends;
  const inflation = curve === null ? null : inflationOf(curve).rate;
  const risk = riskOf(cma, blends);
  const rebalancing = "short" in risk ? null : rebalancingOf(blends, risk);
  const results = resultsOf(
    cmaRates(blends, deductions, inflation ?? 0),
    { stocks: stocks.share },
    rebalancing === null ? 0 : rebalancing.portfolio,
  );
  const isHedged = (blend: Blend): boolean =>
    blend.share > 0 &&
    blend.parts.some(({ asset }) => asset.hedges !== undefined);
  const figuresOf = (
    format: (value: number) => string,
    { bonds: bond, portfolio, stocks: stock }: Across,
    shows: (blend: Blend) => boolean = (blend) => blend.parts.length > 0,
  ): readonly string[] => [
    shows(stocks) ? format(stock) : "—",
    shows(bonds) ? format(bond) : "—",
    format(portfolio),
  ];
  const weighted = (of: (blend: Blend) => number): Across => ({
    bonds: of(bonds),
    portfolio: stocks.share * of(stocks) + bonds.share * of(bonds),
    stocks: of(stocks),
  });
  const isYielding = (blend: Blend): boolean =>
    blend === stocks && blend.parts.length > 0;
  return [
    {
      figures: figuresOf(
        formatPercent,
        {
          bonds: bonds.share,
          portfolio: stocks.share + bonds.share,
          stocks: stocks.share,
        },
        () => true,
      ),
      label: weight,
    },
    {
      figures: figuresOf(
        formatCurveRate,
        weighted(({ rate }) => rate),
      ),
      label: "Blended 20y GBP return",
    },
    ...(isHedged(stocks) || isHedged(bonds)
      ? [
          {
            figures: figuresOf(
              formatPoints,
              weighted(({ hedging }) => hedging),
              isHedged,
            ),
            label: "GBP-hedging adjustment",
          },
        ]
      : []),
    {
      figures: figuresOf(
        formatPoints,
        weighted(() => -deductions.fees),
      ),
      label: "Fee drag",
    },
    ...(rebalancing === null
      ? []
      : [
          {
            figures: figuresOf(formatPoints, rebalancing),
            label: "Rebalancing",
          },
        ]),
    {
      figures: figuresOf(formatPercent, results.nominal),
      isResult: true,
      label: "Return",
    },
    { figures: figuresOf(formatPercent, results.growth), label: "Growth" },
    {
      figures: figuresOf(formatPercent, results.yield, isYielding),
      label: "Dividend yield",
    },
    {
      detail:
        inflation === null
          ? "Once a BoE curve is pulled"
          : `Over ${formatPercent(inflation)} inflation`,
      figures:
        inflation === null
          ? ["—", "—", "—"]
          : figuresOf(formatPercent, results.real),
      isResult: true,
      label: "Real return",
    },
  ];
}

// Every category's share of the whole, on a sunken panel headed as a
// region of its own beneath the worksheet, split by the sleeve it blends
// into, the one its class in the latest vintage is priced in, and scaled
// by how far its sleeve is held above or below the target allocation's
// share of it, as a glide path holds it: a share of nothing muted. A sleeve to a
// column where the screen is wide enough, and where it is wider still,
// stocks take two of three columns and run down both, since that is
// where a portfolio's categories are, so the panel is as tall as half of
// them; one with more bond categories than equity would want it the
// other way about. The card is drawn only when every category asking
// for a share has a class, so one without asks for nothing and is left
// out of both.
function Weights({
  cma,
  heading,
  mappings,
  scale,
  targets,
}: {
  readonly cma: Cma;
  readonly heading: string;
  readonly mappings: readonly Mapping[];
  readonly scale: Readonly<Record<Sleeve, number>>;
  readonly targets: Targets;
}): JSX.Element {
  const id = useId();
  const priced = new Map(cma.assets.map(({ name, sleeve }) => [name, sleeve]));
  const sleeveOf = (category: string): Sleeve | undefined =>
    priced.get(
      mappings.find((mapping) => mapping.category === category)?.asset ?? "",
    );
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 rounded-lg bg-muted p-5"
    >
      <h3 className="label text-muted-foreground" id={id}>
        {heading}
      </h3>
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8 xl:grid-cols-3">
        {(["stocks", "bonds"] as const).map((sleeve) => (
          <div
            aria-labelledby={`${id}-${sleeve}`}
            className={cn(
              "grid content-start gap-3",
              sleeve === "stocks" && "xl:col-span-2",
            )}
            key={sleeve}
            role="group"
          >
            <h4 className="label text-muted-foreground" id={`${id}-${sleeve}`}>
              {headings[sleeve]}
            </h4>
            <dl className={cn(sleeve === "stocks" && "xl:columns-2 xl:gap-8")}>
              {targets.categories
                .filter(({ id: category }) => sleeveOf(category) === sleeve)
                .map(({ id: category, name, share }) => {
                  const tone =
                    share === 0 ? "text-muted-foreground" : undefined;
                  return (
                    <div
                      className="flex break-inside-avoid justify-between gap-4 pb-3"
                      key={category}
                    >
                      <dt className={tone}>{name}</dt>
                      <dd className={cn("figure", tone)}>
                        {formatPercent(share * scale[sleeve])}
                      </dd>
                    </div>
                  );
                })}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

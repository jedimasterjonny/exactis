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
import type { Across } from "@/data/rates";
import type { Targets } from "@/data/targets";

import { Caution } from "@/components/app/atoms/caution";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { Note } from "@/components/app/atoms/note";
import { Worksheet } from "@/components/app/atoms/worksheet";
import { CardContent, CardFooter } from "@/components/kit/card";
import { blendsOf, cmaRates } from "@/data/cma";
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
  readonly targets: null | Targets;
}

// What each sleeve is headed as, in the worksheet's columns and over its
// weights.
const headings: Record<Sleeve, string> = { bonds: "Bonds", stocks: "Stocks" };

// The worksheet's columns: each sleeve, then the portfolio they make.
const columns = [headings.stocks, headings.bonds, "Portfolio"] as const;

// What each source is named as, and what a change of it was, in the
// rows of what moved the rates.
const sourceRows: Record<Source, { detail: string; label: string }> = {
  cma: { detail: "A vintage pulled since", label: "BlackRock CMA" },
  curve: { detail: "A curve pulled since", label: "BoE curve" },
  deductions: { detail: "Typed again since", label: "Fees and yield" },
  targets: {
    detail: "Imported or mapped again since",
    label: "Target allocation",
  },
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
// sterling, and the fees, closing on the return each comes to, which for
// the portfolio is the plan rate; then the growth and the yield that
// return is made of, which are the rates the plan takes, and what it
// comes to over the curve's inflation. The portfolio's figure in each
// row is the sleeves' in the shares the target allocation holds of them.
// A sleeve nothing blends into is dashed. Under the worksheet, every
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
// Before a vintage is pulled, or a target allocation imported on its
// tab, there is nothing to work out, and the body says so; while the
// vintage makes no blend, it says what is missing in the caution tone.
// The footer states what the figures are.
export function CmaWorksheet({
  before,
  cma,
  curve,
  deductions,
  fields,
  mappings,
  targets,
}: CmaWorksheetProps): JSX.Element {
  const moves =
    before === null
      ? null
      : movesBetween(before.sources, {
          cma,
          curve,
          deductions,
          mappings,
          targets,
        });
  return (
    <>
      <CardContent className="grid gap-8">
        {fields}
        {cma === null && (
          <EmptyState
            description="Pull BlackRock's workbook to blend its 20-year GBP returns by your target allocation."
            icon={Sheet}
            title="No CMA pulled yet"
          />
        )}
        {cma !== null && targets === null && (
          <EmptyState
            description="Import a target allocation on its tab to weight the CMA's returns by."
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
            targets={targets}
          />
        )}
        {moves !== null && before !== null && (
          <Moved moves={moves} since={before.savedOn} />
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {`${cma === null ? "GBP rows, 20-year column" : asOf(cma)}. Nominal down to the real return. The dividend yield moves stocks' return between growth and yield, and their total stays as it is.`}
      </CardFooter>
    </>
  );
}

// Which figures of the latest vintage the card reads, and the day
// they are as of.
function asOf({ latest }: Vintages): string {
  return `GBP rows, 20-year column, data as of ${formatDay(latest.asOf)}`;
}

// The latest vintage worked out by the target allocation, with the
// weights it is worked out by beneath, or what keeps it from being
// blended.
function Blended({
  cma,
  curve,
  deductions,
  mappings,
  targets,
}: {
  readonly cma: Cma;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly mappings: readonly Mapping[];
  readonly targets: Targets;
}): JSX.Element {
  const blends = blendsOf(cma, targets, mappings);
  if ("short" in blends) {
    return (
      <Caution title="The CMA cannot be blended yet">
        {`${blends.short}. Set it right on the Target allocation tab, and the rates are derived again.`}
      </Caution>
    );
  }
  return (
    <>
      <Worksheet
        columns={columns}
        label="CMA-derived rates, worked out"
        rows={rowsOf(
          blends,
          deductions,
          curve === null ? null : inflationOf(curve).rate,
        )}
      />
      <Weights cma={cma} mappings={mappings} targets={targets} />
    </>
  );
}

// What the bonds' blend rests on: the category weighing most in it and
// how much, or nothing for a sleeve nothing blends into.
function largestOf({ parts }: Blend): string {
  return parts
    .toSorted((one, other) => other.weight - one.weight)
    .slice(0, 1)
    .map(
      ({ category, weight }) =>
        `; ${category.name} is ${formatPercent(weight)} of bonds`,
    )
    .join("");
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
            {
              detail: `As the household stood on ${day}`,
              figures: percents(moves.before),
              label: "Then",
            },
            ...moves.steps.map(({ by, sources }) => ({
              detail:
                sources.length > 1
                  ? "Taken together, since the first alone derives no rates"
                  : sources.map((one) => sourceRows[one].detail).join(""),
              figures: points(by),
              label: listed.format(sources.map((one) => sourceRows[one].label)),
            })),
            {
              detail: "What the sources come to today",
              figures: percents(moves.now),
              isResult: true,
              label: "Now",
            },
          ]}
        />
      )}
    </section>
  );
}

// The worksheet's rows, from the target weights to the real return.
// Each sleeve's figure is dashed where nothing blends into it, and the
// portfolio's is the sleeves' in the shares the target allocation holds,
// which leaves out the sleeve that holds none. The hedging row is there
// only while a class is hedged to sterling, and dashed for a sleeve with
// none hedged. Bonds pay no yield, so theirs is dashed. Before a curve
// is pulled there is no inflation to read the return over, and the real
// return is dashed.
function rowsOf(
  blends: { readonly bonds: Blend; readonly stocks: Blend },
  deductions: Deductions,
  inflation: null | number,
): readonly WorksheetRow[] {
  const { bonds, stocks } = blends;
  const results = resultsOf(cmaRates(blends, deductions, inflation ?? 0), {
    stocks: stocks.share,
  });
  const isHedged = (blend: Blend): boolean =>
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
      detail: "The target allocation's split between the sleeves",
      figures: figuresOf(
        formatPercent,
        {
          bonds: bonds.share,
          portfolio: stocks.share + bonds.share,
          stocks: stocks.share,
        },
        () => true,
      ),
      label: "Target weight",
    },
    {
      detail: `Weighted by target allocation${largestOf(bonds)}`,
      figures: figuresOf(
        formatCurveRate,
        weighted(({ rate }) => rate),
      ),
      label: "Blended 20y GBP return",
    },
    ...(isHedged(stocks) || isHedged(bonds)
      ? [
          {
            detail: "Carried from US to UK cash, 20y point",
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
      detail: "Typed above, off both sleeves alike",
      figures: figuresOf(
        formatPoints,
        weighted(() => -deductions.fees),
      ),
      label: "Fee drag",
    },
    {
      detail: "What each comes to; the portfolio's is the plan rate",
      figures: figuresOf(formatPercent, results.nominal),
      isResult: true,
      label: "Return",
    },
    {
      detail: "The return less the yield, the growth the plan takes",
      figures: figuresOf(formatPercent, results.growth),
      label: "Growth",
    },
    {
      detail: "Typed above, paid on top of the growth",
      figures: figuresOf(formatPercent, results.yield, isYielding),
      label: "Dividend yield",
    },
    {
      detail:
        inflation === null
          ? "Over inflation, once a BoE curve is pulled"
          : `Over ${formatPercent(inflation)} inflation, compounded rather than subtracted`,
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
// into, the one its class in the latest vintage is priced in: a share of
// nothing muted, and where the shares come from beneath. A sleeve to a
// column where the screen is wide enough, and where it is wider still,
// stocks take two of three columns and run down both, since that is
// where a portfolio's categories are, so the panel is as tall as half of
// them; one with more bond categories than equity would want it the
// other way about. The card is drawn only when every category asking
// for a share has a class, so one without asks for nothing and is left
// out of both.
function Weights({
  cma,
  mappings,
  targets,
}: {
  readonly cma: Cma;
  readonly mappings: readonly Mapping[];
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
        Target weights
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
                        {formatPercent(share)}
                      </dd>
                    </div>
                  );
                })}
            </dl>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        From the Target allocation tab — portfolio targets, not current
        holdings.
      </p>
    </section>
  );
}

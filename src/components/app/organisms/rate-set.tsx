"use client";

import type { JSX } from "react";

import { Check, Lock } from "lucide-react";
import { useOptimistic } from "react";

import type { Deductions, Mapping, Sleeve, Vintages } from "@/data/cma";
import type { Curve } from "@/data/inflation";
import type { Allocation, RateSet as Chosen, Rates } from "@/data/rates";
import type { Targets } from "@/data/targets";

import { saveRates, saveRateSet } from "@/actions/plan";
import { Caution } from "@/components/app/atoms/caution";
import { DeltaValue } from "@/components/app/atoms/delta-value";
import { FieldRow } from "@/components/app/atoms/field-row";
import { NamedFigure } from "@/components/app/atoms/named-figure";
import { RadioChoice } from "@/components/app/atoms/radio-choice";
import { RateField } from "@/components/app/molecules/figure-field";
import { SectionCard } from "@/components/app/molecules/section-card";
import { Badge } from "@/components/kit/badge";
import { CardContent } from "@/components/kit/card";
import { RadioGroup } from "@/components/kit/radio-group";
import {
  blendsOf,
  derivedSet,
  sleeves,
  stocksMoved,
  vintageMonth,
} from "@/data/cma";
import { planRate, realRate, stocksTotal } from "@/data/rates";
import { useSender } from "@/hooks/use-sender";
import { formatPercent } from "@/lib/money";
import { formatDay } from "@/lib/months";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface RateSetProps {
  readonly allocation: Allocation;
  readonly cma: null | Vintages;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly mappings: readonly Mapping[];
  readonly rates: Rates;
  readonly rateSet: Chosen;
  readonly targets: null | Targets;
}

// What the toast says the plan now runs on, by the set chosen.
const runsOn: Record<Chosen, string> = {
  cma: "The plan runs on the CMA-derived rates",
  custom: "The plan runs on the custom rates",
};

// The rates the plan runs on and where they come from, at the head of
// the assumptions screen. A line above the cards says which set is
// live: the CMA-derived one, under a badge in the positive tone; or the
// rates typed by hand, under a caution saying the derivation further down
// is set aside and what that costs. Beneath it, side by side where the screen is wide
// enough, the choice of set and the rates themselves.
//
// The set is chosen as a radio is pressed, and saved as it is: the
// choice shows at once while the store is asked, and the store's answer
// draws the screen again from the set kept, under a toast, or puts the
// choice back and says why under a toast, as when the CMA gives no
// rates for want of a class. Historical returns are offered and refused
// until they are built.
//
// The CMA-derived rates are shown as the CMA, the target allocation, the
// curve and the deductions make them, read-only under a badge saying
// they are edited at their sources, each with where it comes from
// beneath it, then stocks' total, how far the latest vintage moved it
// from the one before, bonds' total, and the vintage. Before the CMA
// gives any, the figures are left blank. The rates typed by hand are
// typed where they are shown, with no dialog, and saved as the focus
// leaves each, alone, so the others are kept as the store has them. One
// that reads as it did, typed back to it or only passed through, is not
// sent: the field commits a rate as it shows it, to a hundredth of a
// point, so a rate kept finer than that, as a curve's inflation is
// carried in, would otherwise be written over by its own rounding. The
// figure shows the rate typed at once, and the totals beneath follow
// it, while the store is asked; the store's answer draws the screen
// again from the rates kept, with a toast saying what they now are, or
// puts the figure back and says why under a toast when a rate is
// refused.
//
// Beneath either set, what it comes to over inflation: stocks, bonds and
// the portfolio the split makes of them, the CMA's under the target
// allocation and the rates typed under the split typed, following a rate
// as it is typed.
export function RateSet({
  allocation,
  cma,
  curve,
  deductions,
  mappings,
  rates,
  rateSet,
  targets,
}: RateSetProps): JSX.Element {
  const [shown, show] = useOptimistic(
    rates,
    (current: Rates, patch: Partial<Rates>) => ({ ...current, ...patch }),
  );
  const [chosen, choose] = useOptimistic(rateSet);
  const { send } = useSender();

  function save(key: keyof Rates, value: number): void {
    if (formatPercent(value) === formatPercent(shown[key])) {
      return;
    }
    const patch = { [key]: value };
    send(
      async () => {
        show(patch);
        return saveRates(patch);
      },
      {
        failure: "Rates not saved",
        success: (saved) => ({
          description: `Stocks ${formatPercent(stocksTotal(saved))} · bonds ${formatPercent(saved.bonds)} · inflation ${formatPercent(saved.inflation)}`,
          title: "Rates saved",
        }),
      },
    );
  }

  // Historical is never chosen, since it cannot be pressed, so what is
  // not the CMA's is the rates typed.
  function pick(value: unknown): void {
    const next: Chosen = value === "cma" ? "cma" : "custom";
    send(
      async () => {
        choose(next);
        return saveRateSet(next);
      },
      {
        failure: "Rate set not changed",
        success: (saved) => ({
          description: runsOn[saved],
          title: "Rate set chosen",
        }),
      },
    );
  }

  return (
    <>
      {chosen === "cma" ? (
        <p className="flex">
          <Badge className="label" variant="positive">
            <Check aria-hidden />
            CMA-derived set is live
          </Badge>
        </p>
      ) : (
        <Caution title="Custom rates are live — the CMA derivation below is ignored">
          Hand-typed rates do not move when you pull a new CMA or BoE curve, and
          nothing warns you when they go stale.
        </Caution>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <SectionCard label="Mode" title="Rate set">
          <CardContent>
            <RadioGroup
              aria-label="Rate set"
              className="gap-5"
              onValueChange={pick}
              value={chosen}
            >
              <RadioChoice label="From CMA" value="cma">
                Rates derived from the capital market assumptions and your
                target allocation
              </RadioChoice>
              <RadioChoice label="Custom" value="custom">
                One rate per class, typed by hand, flat for life
              </RadioChoice>
              <RadioChoice isDisabled label="Historical" value="historical">
                Returns replayed from history, not built yet
              </RadioChoice>
            </RadioGroup>
          </CardContent>
        </SectionCard>
        {chosen === "cma" ? (
          <Derived
            cma={cma}
            curve={curve}
            deductions={deductions}
            mappings={mappings}
            targets={targets}
          />
        ) : (
          <SectionCard
            label={subsectionLabel(assumptions, 1)}
            title="Custom rates"
          >
            <CardContent className="grid gap-6">
              <FieldRow layout="pair">
                <RateField
                  hint="Typed by hand"
                  label="Stocks growth"
                  min={-1}
                  onValueCommitted={(value) => {
                    save("stocks", value);
                  }}
                  value={shown.stocks}
                />
                <RateField
                  hint="Added to growth — always change the pair"
                  label="Dividend yield"
                  min={0}
                  onValueCommitted={(value) => {
                    save("dividends", value);
                  }}
                  value={shown.dividends}
                />
              </FieldRow>
              <FieldRow layout="pair">
                <RateField
                  hint="Typed by hand"
                  label="Bonds growth"
                  min={-1}
                  onValueCommitted={(value) => {
                    save("bonds", value);
                  }}
                  value={shown.bonds}
                />
                <RateField
                  hint="Typed by hand — the BoE derivation below is ignored"
                  label="Inflation"
                  onValueCommitted={(value) => {
                    save("inflation", value);
                  }}
                  value={shown.inflation}
                />
              </FieldRow>
              <dl className="flex flex-wrap gap-x-10 gap-y-6 border-t pt-6">
                <NamedFigure name="Stocks total">
                  {formatPercent(stocksTotal(shown))}
                </NamedFigure>
                <NamedFigure name="Bonds total">
                  {formatPercent(shown.bonds)}
                </NamedFigure>
              </dl>
              <RealReturns
                bonds={shown.bonds}
                inflation={shown.inflation}
                portfolio={planRate(shown, allocation)}
                stocks={stocksTotal(shown)}
              />
            </CardContent>
          </SectionCard>
        )}
      </div>
    </>
  );
}

// The rates the CMA gives, read-only, each with where it comes from,
// and what they come to: stocks' total, the move the latest vintage
// made in it, once there is a vintage before it to move from, bonds'
// total, which is their growth, since they pay no yield on top, and the
// vintage.
function Derived({
  cma,
  curve,
  deductions,
  mappings,
  targets,
}: Omit<RateSetProps, "allocation" | "rates" | "rateSet">): JSX.Element {
  const derived = derivedSet({ cma, curve, deductions, mappings, targets });
  const rates = "short" in derived ? null : derived.rates;
  const empty = emptySleeveOf(cma, targets, mappings);
  const held = (sleeve: Sleeve): null | Rates =>
    empty === sleeve ? null : rates;
  const stocks = held("stocks");
  const bonds = held("bonds")?.bonds ?? null;
  const vintage = cma === null ? "—" : vintageMonth(cma.latest);
  const before = cma?.previous ?? null;
  const moved = cma === null ? null : stocksMoved(cma, targets, mappings);
  return (
    <SectionCard
      actions={
        <Badge className="label" variant="outline">
          <Lock aria-hidden />
          Derived — edit the sources below
        </Badge>
      }
      label={subsectionLabel(assumptions, 1)}
      title="CMA-derived rates"
    >
      <CardContent className="grid gap-6">
        <FieldRow layout="pair">
          <RateField
            hint={stocksHint(cma, empty)}
            isReadOnly
            label="Stocks growth"
            value={held("stocks")?.stocks ?? null}
          />
          <RateField
            hint="Typed in the return source below"
            isReadOnly
            label="Dividend yield"
            value={held("stocks")?.dividends ?? null}
          />
        </FieldRow>
        <FieldRow layout="pair">
          <RateField
            hint={
              empty === "bonds"
                ? nothingIn("bonds")
                : "Blended from the bond sleeve, less fees"
            }
            isReadOnly
            label="Bonds growth"
            value={held("bonds")?.bonds ?? null}
          />
          <RateField
            hint={
              curve === null
                ? "From the BoE curve, once one is pulled"
                : `From the BoE curve, ${formatDay(curve.asOf)}`
            }
            isReadOnly
            label="Inflation"
            value={rates?.inflation ?? null}
          />
        </FieldRow>
        <dl className="flex flex-wrap gap-x-10 gap-y-6 border-t pt-6">
          <NamedFigure name="Stocks total">
            {stocksTotalOf(held("stocks"))}
          </NamedFigure>
          {before !== null && moved !== null && (
            <div className="grid gap-1">
              <dt className="label text-muted-foreground">
                {`vs ${vintageMonth(before)}`}
              </dt>
              <dd className="pt-2">
                <DeltaValue format="points" value={moved * 100} />
              </dd>
            </div>
          )}
          <NamedFigure name="Bonds total">
            {bonds === null ? "—" : formatPercent(bonds)}
          </NamedFigure>
          <NamedFigure name="CMA vintage">{vintage}</NamedFigure>
        </dl>
        <RealReturns
          bonds={bonds}
          inflation={rates?.inflation ?? null}
          portfolio={
            "short" in derived
              ? null
              : planRate(derived.rates, derived.allocation)
          }
          stocks={stocks === null ? null : stocksTotal(stocks)}
        />
      </CardContent>
    </SectionCard>
  );
}

// The sleeve nothing in the target allocation blends into, if one is,
// whose rates stand in at the other sleeve's and are shown as empty.
function emptySleeveOf(
  cma: null | Vintages,
  targets: null | Targets,
  mappings: readonly Mapping[],
): null | Sleeve {
  const blends = cma === null ? null : blendsOf(cma.latest, targets, mappings);
  if (blends === null || "short" in blends) {
    return null;
  }
  return sleeves.find((sleeve) => blends[sleeve].parts.length === 0) ?? null;
}

// What a field of a sleeve nothing blends into says in place of where
// its rate comes from.
function nothingIn(sleeve: Sleeve): string {
  return `Nothing in the target allocation blends into ${sleeve}`;
}

// What stocks, bonds and the portfolio return in all come to over
// inflation, in today's money, each a dash where there is no rate for
// it. A line under them says the two compound, since subtracting is the
// sum a reader checks them by and comes out a little high.
function RealReturns({
  inflation,
  ...nominal
}: Readonly<
  Record<"bonds" | "inflation" | "portfolio" | "stocks", null | number>
>): JSX.Element {
  const real = (rate: null | number): string =>
    rate === null || inflation === null
      ? "—"
      : formatPercent(realRate(rate, inflation));
  return (
    <div className="grid gap-3">
      <dl className="flex flex-wrap gap-x-10 gap-y-6">
        <NamedFigure name="Real stocks">{real(nominal.stocks)}</NamedFigure>
        <NamedFigure name="Real bonds">{real(nominal.bonds)}</NamedFigure>
        <NamedFigure name="Real portfolio">
          {real(nominal.portfolio)}
        </NamedFigure>
      </dl>
      <p className="text-sm text-muted-foreground">
        Over inflation, compounded rather than subtracted — what a balance grows
        at in today&apos;s money.
      </p>
    </div>
  );
}

// Where stocks' growth comes from: the vintage, once one is pulled, or
// nowhere, for a target allocation with nothing in stocks.
function stocksHint(cma: null | Vintages, empty: null | Sleeve): string {
  if (empty === "stocks") {
    return nothingIn("stocks");
  }
  return cma === null
    ? "From the CMA, once one is pulled"
    : `From the ${vintageMonth(cma.latest)} CMA, less fees and yield`;
}

// Stocks' return in all, or a dash where there are no rates for them.
function stocksTotalOf(rates: null | Rates): string {
  return rates === null ? "—" : formatPercent(stocksTotal(rates));
}

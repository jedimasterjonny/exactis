"use client";

import type { JSX } from "react";

import { useOptimistic } from "react";

import type { Across, Allocation, Rates } from "@/data/rates";

import { saveAllocation, saveRates } from "@/actions/plan";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Worksheet } from "@/components/app/atoms/worksheet";
import { RateField } from "@/components/app/molecules/figure-field";
import { CardContent } from "@/components/kit/card";
import { resultsOf, stocksTotal } from "@/data/rates";
import { useSender } from "@/hooks/use-sender";
import { formatPercent } from "@/lib/money";

interface CustomRatesProps {
  readonly allocation: Allocation;
  readonly rates: Rates;
}

// The body of the rates card while the rates typed by hand are live: a
// rate for each class and for inflation, and the share of the savings in
// stocks, one split for the whole plan and flat for life, the rest in
// bonds; then what they come to, worked out as the CMA's rates are, a
// column for stocks, bonds and the portfolio the split makes of them:
// the weight, the return, which for the portfolio is the plan rate, the
// growth and the yield it is made of, and the return over inflation.
//
// Each is typed where it is shown, with no dialog, and saved as the
// focus leaves it, alone, so the others are kept as the store has them.
// One that reads as it did, typed back to it or only passed through, is
// not sent: the field commits a rate as it shows it, to a hundredth of a
// point, so a rate kept finer than that, as a curve's inflation is
// carried in, would otherwise be written over by its own rounding. The
// figure shows what was typed at once, and the worksheet follows it,
// while the store is asked; the store's answer draws the screen again
// from what it kept, with a toast saying what it now is, or puts the
// figure back and says why under a toast when it is refused. The rates'
// toast gives no plan rate, since a save of the split still on its way
// ahead of it would make one worked out here wrong, and the split's
// none for the same reason the other way about.
export function CustomRates({
  allocation,
  rates,
}: CustomRatesProps): JSX.Element {
  const [shownRates, showRates] = useOptimistic(
    rates,
    (current: Rates, patch: Partial<Rates>) => ({ ...current, ...patch }),
  );
  const [shownSplit, showSplit] = useOptimistic(allocation);
  const { send } = useSender();

  function saveRate(key: keyof Rates, value: number): void {
    if (formatPercent(value) === formatPercent(shownRates[key])) {
      return;
    }
    const patch = { [key]: value };
    send(
      async () => {
        showRates(patch);
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

  function saveSplit(stocks: number): void {
    if (stocks === shownSplit.stocks) {
      return;
    }
    const next = { stocks };
    send(
      async () => {
        showSplit(next);
        return saveAllocation(next);
      },
      {
        failure: "Allocation not saved",
        success: (saved) => ({
          description: `${formatPercent(saved.stocks)} in stocks, ${formatPercent(1 - saved.stocks)} in bonds`,
          title: "Allocation saved",
        }),
      },
    );
  }

  const results = resultsOf(shownRates, shownSplit);
  const figuresOf = ({ bonds, portfolio, stocks }: Across): string[] =>
    [stocks, bonds, portfolio].map((figure) => formatPercent(figure));
  return (
    <CardContent className="grid gap-8">
      <div className="grid gap-6">
        <FieldRow layout="pair">
          <RateField
            hint="Typed by hand"
            label="Stocks growth"
            min={-1}
            onValueCommitted={(value) => {
              saveRate("stocks", value);
            }}
            value={shownRates.stocks}
          />
          <RateField
            hint="Added to growth — always change the pair"
            label="Dividend yield"
            min={0}
            onValueCommitted={(value) => {
              saveRate("dividends", value);
            }}
            value={shownRates.dividends}
          />
        </FieldRow>
        <FieldRow layout="pair">
          <RateField
            hint="Typed by hand"
            label="Bonds growth"
            min={-1}
            onValueCommitted={(value) => {
              saveRate("bonds", value);
            }}
            value={shownRates.bonds}
          />
          <RateField
            hint="Typed by hand — the BoE derivation below is ignored"
            label="Inflation"
            onValueCommitted={(value) => {
              saveRate("inflation", value);
            }}
            value={shownRates.inflation}
          />
        </FieldRow>
        <FieldRow layout="pair">
          <RateField
            hint="The rest is held in bonds, flat for life"
            label="Stocks share"
            max={1}
            min={0}
            onValueCommitted={saveSplit}
            value={shownSplit.stocks}
          />
        </FieldRow>
      </div>
      <Worksheet
        columns={["Stocks", "Bonds", "Portfolio"]}
        label="Custom rates, worked out"
        rows={[
          {
            detail: "The split typed above",
            figures: figuresOf({
              bonds: 1 - shownSplit.stocks,
              portfolio: 1,
              stocks: shownSplit.stocks,
            }),
            label: "Weight",
          },
          {
            detail: "Growth and yield added; the portfolio's is the plan rate",
            figures: figuresOf(results.nominal),
            isResult: true,
            label: "Return",
          },
          {
            detail: "Typed above",
            figures: figuresOf(results.growth),
            label: "Growth",
          },
          {
            detail: "Typed above, paid on top of the growth",
            figures: [
              formatPercent(results.yield.stocks),
              "—",
              formatPercent(results.yield.portfolio),
            ],
            label: "Dividend yield",
          },
          {
            detail: `Over ${formatPercent(shownRates.inflation)} inflation, compounded rather than subtracted`,
            figures: figuresOf(results.real),
            isResult: true,
            label: "Real return",
          },
        ]}
      />
    </CardContent>
  );
}

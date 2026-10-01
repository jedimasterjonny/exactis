"use client";

import type { JSX } from "react";

import { useOptimistic } from "react";

import type { Allocation, Rates } from "@/data/rates";

import { saveAllocation } from "@/actions/plan";
import { NamedFigure } from "@/components/app/atoms/named-figure";
import { RateField } from "@/components/app/molecules/figure-field";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { planRate } from "@/data/rates";
import { useSender } from "@/hooks/use-sender";
import { formatPercent } from "@/lib/money";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface AssetAllocationProps {
  readonly allocation: Allocation;
  readonly rates: Rates;
}

// The assumptions screen's third section while the rates typed by hand
// are live: how the savings are split between stocks and bonds, one
// split for the whole plan and flat for life, and the plan rate it makes
// of the rates live, which every account on the plan rate grows at.
// The share in stocks is typed, held between none and all, and the rest
// is in bonds. It is saved as the focus leaves it, and one typed back to
// what it was is not sent. The
// bonds' share and the plan rate beside it follow the share typed at
// once while the store is asked; its answer draws the page again from
// the split kept, under a toast giving the split, or puts the share
// back and says why under a toast when it is refused. The toast gives
// no plan rate, since a save of the rates still on its way ahead of
// this one would make a rate worked out from the rates above wrong.
export function AssetAllocation({
  allocation,
  rates,
}: AssetAllocationProps): JSX.Element {
  const [shown, show] = useOptimistic(allocation);
  const { send } = useSender();

  function save(stocks: number): void {
    if (stocks === shown.stocks) {
      return;
    }
    const next = { stocks };
    send(
      async () => {
        show(next);
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

  return (
    <SectionCard label={subsectionLabel(assumptions, 3)} title="Allocation">
      <CardContent className="grid items-start gap-6 sm:grid-cols-2">
        <RateField
          hint="The rest is held in bonds, flat for life"
          label="Stocks share"
          max={1}
          min={0}
          onValueCommitted={save}
          value={shown.stocks}
        />
        <dl className="flex gap-10">
          <NamedFigure name="Bonds share">
            {formatPercent(1 - shown.stocks)}
          </NamedFigure>
          <NamedFigure name="Plan rate">
            {formatPercent(planRate(rates, shown))}
          </NamedFigure>
        </dl>
      </CardContent>
    </SectionCard>
  );
}

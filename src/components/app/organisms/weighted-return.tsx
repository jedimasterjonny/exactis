import type { JSX } from "react";

import type { Blend, Mapping, Vintages } from "@/data/cma";
import type { Targets } from "@/data/targets";

import { NamedFigure } from "@/components/app/atoms/named-figure";
import { Note } from "@/components/app/atoms/note";
import { SplitBar } from "@/components/app/atoms/split-bar";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { blendsOf } from "@/data/cma";
import { formatCurveRate } from "@/lib/money";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface WeightedReturnProps {
  readonly cma: null | Vintages;
  readonly mappings: readonly Mapping[];
  readonly targets: null | Targets;
}

// The assumptions screen's third section while the CMA-derived rates are
// live: the split of the savings the plan runs on, which is the target
// allocation's between the sleeves, and what the latest vintage expects
// of each sleeve and of the two together, gross of the fees and before
// the yield is split out. The split is written in shares of the whole to
// a tenth of a point, stocks first, over a bar drawing it. Each sleeve's
// return is its blend's return in all, hedging included, and the
// portfolio's the two weighted by the split, so it is what the plan
// earns before fees. The rates the plan runs on are worked out from the
// same blends, so a target weight changed moves them together, as the
// card says. A sleeve nothing in the allocation blends into is dashed,
// since it holds none of the whole. Before the vintage blends, as it
// does whenever these rates are live, the card says what is missing in
// place of the figures.
export function WeightedReturn({
  cma,
  mappings,
  targets,
}: WeightedReturnProps): JSX.Element {
  const blends =
    cma === null
      ? { short: "No CMA is pulled" }
      : blendsOf(cma.latest, targets, mappings);
  return (
    <SectionCard
      label={subsectionLabel(assumptions, 3)}
      title="Weighted CMA return"
    >
      <CardContent className="grid gap-6">
        {"short" in blends ? (
          <Note>{blends.short}</Note>
        ) : (
          <>
            <div className="grid gap-3">
              <p className="flex items-baseline justify-between gap-4">
                <span className="label text-muted-foreground">
                  Target split
                </span>
                <span className="figure">
                  {`${(blends.stocks.share * 100).toFixed(1)} / ${(blends.bonds.share * 100).toFixed(1)}`}
                </span>
              </p>
              <SplitBar share={blends.stocks.share} />
            </div>
            <dl className="flex flex-wrap gap-x-10 gap-y-6">
              <NamedFigure name="Equities">
                {returnOf(blends.stocks)}
              </NamedFigure>
              <NamedFigure name="Bonds">{returnOf(blends.bonds)}</NamedFigure>
              <NamedFigure name="Portfolio">
                {formatCurveRate(
                  blends.stocks.share *
                    (blends.stocks.rate + blends.stocks.hedging) +
                    blends.bonds.share *
                      (blends.bonds.rate + blends.bonds.hedging),
                )}
              </NamedFigure>
            </dl>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          Change a target weight and the CMA-derived rates above move with it.
        </p>
      </CardContent>
    </SectionCard>
  );
}

// A sleeve's return in all, hedging included, or a dash for a sleeve
// nothing blends into.
function returnOf({ hedging, parts, rate }: Blend): string {
  return parts.length === 0 ? "—" : formatCurveRate(rate + hedging);
}

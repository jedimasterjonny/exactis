"use client";

import type { JSX } from "react";

import { useOptimistic } from "react";

import type { Rates } from "@/data/rates";

import { saveRates } from "@/actions/plan";
import { Caution } from "@/components/app/atoms/caution";
import { FieldRow } from "@/components/app/atoms/field-row";
import { NamedFigure } from "@/components/app/atoms/named-figure";
import { RadioChoice } from "@/components/app/atoms/radio-choice";
import { RateField } from "@/components/app/molecules/rate-field";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CardContent } from "@/components/kit/card";
import { RadioGroup } from "@/components/kit/radio-group";
import { stocksTotal } from "@/data/rates";
import { useSender } from "@/hooks/use-sender";
import { formatPercent } from "@/lib/money";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface RateSetProps {
  readonly rates: Rates;
}

// The rates the plan runs on and where they come from, at the head of
// the assumptions screen. A caution says the rates typed by hand are
// the ones live, so the derivation further down is not, and what that
// costs. Beneath it, side by side where the screen is wide enough, the
// rate set, a choice of where the rates come from, and the rates
// themselves. Custom, typed by hand, is the only choice that can be
// made so far; deriving them from capital market assumptions is offered
// and refused until it is built. Each rate is typed where it is shown,
// with no dialog, and saved as the focus leaves it, alone, so the
// others are kept as the store has them. One that reads as it did,
// typed back to it or only passed through, is not sent: the field
// commits a rate as it shows it, to a hundredth of a point, so a rate
// kept finer than that, as a curve's inflation is carried in, would
// otherwise be written over by its own rounding. The figure shows the
// rate typed at once, and stocks' total beneath follows it, while the
// store is asked; the store's
// answer draws the screen again from the rates kept, with a toast
// saying what they now are, or puts the figure back and says why under
// a toast when a rate is refused.
export function RateSet({ rates }: RateSetProps): JSX.Element {
  const [shown, show] = useOptimistic(
    rates,
    (current: Rates, patch: Partial<Rates>) => ({ ...current, ...patch }),
  );
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

  return (
    <>
      <Caution title="Custom rates are live — the derivation below is ignored">
        Hand-typed rates do not move when you pull a new BoE curve, and nothing
        warns you when they go stale.
      </Caution>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <SectionCard label="Mode" title="Rate set">
          <CardContent>
            <RadioGroup
              aria-label="Rate set"
              className="gap-5"
              defaultValue="custom"
            >
              <RadioChoice isDisabled label="From CMA" value="cma">
                Rates derived from the capital market assumptions and your
                target allocation
              </RadioChoice>
              <RadioChoice label="Custom" value="custom">
                One rate per class, typed by hand, flat for life
              </RadioChoice>
            </RadioGroup>
          </CardContent>
        </SectionCard>
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
            <dl className="flex border-t pt-6">
              <NamedFigure name="Stocks total">
                {formatPercent(stocksTotal(shown))}
              </NamedFigure>
            </dl>
          </CardContent>
        </SectionCard>
      </div>
    </>
  );
}

"use client";

import type { JSX } from "react";

import { Check, Download } from "lucide-react";
import { useId, useOptimistic } from "react";

import type { Deductions, Mapping, Vintages } from "@/data/cma";
import type { Curve } from "@/data/inflation";
import type { Allocation, RateSet as Chosen, Rates } from "@/data/rates";
import type { Targets } from "@/data/targets";

import { pullCma } from "@/actions/cma";
import { saveDeductions, saveRateSet } from "@/actions/plan";
import { Caution } from "@/components/app/atoms/caution";
import { FieldRow } from "@/components/app/atoms/field-row";
import { RadioChoice } from "@/components/app/atoms/radio-choice";
import { RateField } from "@/components/app/molecules/figure-field";
import { SectionCard } from "@/components/app/molecules/section-card";
import { CmaWorksheet } from "@/components/app/organisms/cma-worksheet";
import { CustomRates } from "@/components/app/organisms/custom-rates";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { RadioGroup } from "@/components/kit/radio-group";
import { stocksMoved, vintageMonth, vintageName } from "@/data/cma";
import { useSender } from "@/hooks/use-sender";
import { formatPercent, formatPoints } from "@/lib/money";
import { formatDay, today } from "@/lib/months";
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

// The rates the plan runs on, at the head of the assumptions screen: one
// card, titled by the set that is live, with the choice of set in its
// header and BlackRock's workbook pulled from its corner. Under the
// CMA-derived set the card is the worksheet that derives them; under the
// rates typed by hand, the rates and the split as typed, worked out the
// same way, and the derivation is set aside rather than shown dormant,
// with a caution above the card saying so and what that costs. The
// workbook can be pulled under either, so the CMA's rates can be given
// something to derive from before they are chosen.
//
// The set is chosen as a radio is pressed, and saved as it is: the
// choice shows at once while the store is asked, and the store's answer
// draws the screen again from the set kept, under a toast, or puts the
// choice back and says why under a toast, as when the CMA gives no
// rates for want of a class. Historical returns are offered and refused
// until they are built. The pull holds while it is on its way, and the
// store's answer draws the screen again from the vintage kept, under a
// toast, or says why under a toast when BlackRock or its workbook is
// refused.
//
// The two deductions the CMA's returns are taken down by, the fee drag
// and the dividend yield, are typed in the card under either set: at the
// head of the worksheet under the CMA's, and beneath the rates typed
// under those, set aside and saying so, so they can be made ready
// before the CMA's are chosen rather than taken up as they stood. Each
// is saved as the focus leaves it, alone, and one typed back to what it
// was is not sent; what they come to follows it at once while the store
// is asked, and the store's answer draws the screen again, under a
// toast, or puts it back and says why. Nothing pulled moves them, so
// beneath them is the day they were last set, or that none is kept, and
// a press that confirms them still right as they stand, which dates them
// today and is answered in the same way.
//
// The header's meta line says what the figures come from: the vintage
// and the day its data are as of, and how far it moved stocks' return
// from the vintage before, once there is one; or that the rates are
// typed.
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
  const [chosen, choose] = useOptimistic(rateSet);
  const [shown, show] = useOptimistic(
    deductions,
    (current: Deductions, patch: Partial<Deductions>) => ({
      ...current,
      ...patch,
    }),
  );
  const { isSending, send } = useSender();
  const { isSending: isPulling, send: sendPull } = useSender();
  const asideId = useId();

  function sendDeductions(
    patch: Partial<Pick<Deductions, "dividends" | "fees">>,
    title: string,
  ): void {
    send(
      async () => {
        show({ ...patch, setOn: today() });
        return saveDeductions(patch);
      },
      {
        failure: "Deductions not saved",
        success: (saved) => ({
          description: `Fees ${formatPercent(saved.fees)} · dividend yield ${formatPercent(saved.dividends)}`,
          title,
        }),
      },
    );
  }

  function save(key: "dividends" | "fees", value: number): void {
    if (formatPercent(value) !== formatPercent(shown[key])) {
      sendDeductions({ [key]: value }, "Deductions saved");
    }
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

  function pull(): void {
    sendPull(pullCma, {
      failure: "CMA not pulled",
      success: (pulled) => ({
        description: `${vintageName(pulled)}, data as of ${formatDay(pulled.asOf)}`,
        title: "CMA pulled",
      }),
    });
  }

  const fields = (
    <div className="grid gap-4">
      <FieldRow layout="pair">
        <RateField
          hint="Fund OCFs plus platform charge, off both sleeves"
          label="Fee drag"
          min={0}
          onValueCommitted={(value) => {
            save("fees", value);
          }}
          value={shown.fees}
        />
        <RateField
          hint="Split out of stocks' return and added back on top"
          label="Dividend yield"
          min={0}
          onValueCommitted={(value) => {
            save("dividends", value);
          }}
          value={shown.dividends}
        />
      </FieldRow>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {shown.setOn === undefined
            ? "Fees and yield are not dated: they were set before the day was kept"
            : `Fees and yield last set or confirmed ${formatDay(shown.setOn)}`}
        </p>
        <Button
          disabled={isSending}
          onClick={() => {
            sendDeductions({}, "Deductions confirmed");
          }}
          size="sm"
          variant="outline"
        >
          <Check aria-hidden />
          Still right
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {chosen === "custom" && (
        <Caution title="Custom rates are live — the CMA derivation is set aside">
          Hand-typed rates do not move when you pull a new CMA or BoE curve, and
          nothing warns you when they go stale.
        </Caution>
      )}
      <SectionCard
        actions={
          <Button
            disabled={isPulling}
            onClick={pull}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden />
            Pull CMA workbook
          </Button>
        }
        caption={
          chosen === "custom"
            ? "Typed by hand, flat for life"
            : sourceOf(cma, targets, mappings)
        }
        controls={
          <RadioGroup
            aria-label="Rate set"
            className="grid gap-4 sm:grid-cols-3"
            onValueChange={pick}
            value={chosen}
          >
            <RadioChoice label="From CMA" value="cma">
              Derived from the capital market assumptions and your target
              allocation
            </RadioChoice>
            <RadioChoice label="Custom" value="custom">
              One rate per class, typed by hand, flat for life
            </RadioChoice>
            <RadioChoice isDisabled label="Historical" value="historical">
              Returns replayed from history, not built yet
            </RadioChoice>
          </RadioGroup>
        }
        label={subsectionLabel(assumptions, 1)}
        title={chosen === "cma" ? "CMA-derived rates" : "Custom rates"}
      >
        {chosen === "cma" ? (
          <CmaWorksheet
            cma={cma}
            curve={curve}
            deductions={shown}
            fields={fields}
            mappings={mappings}
            targets={targets}
          />
        ) : (
          <>
            <CustomRates allocation={allocation} rates={rates} />
            <CardContent>
              <section
                aria-labelledby={asideId}
                className="grid gap-4 border-t pt-6"
              >
                <h3 className="label text-muted-foreground" id={asideId}>
                  For the CMA&apos;s rates
                </h3>
                <p className="text-sm text-muted-foreground">
                  Set aside while the custom rates are live, and taken up as
                  they stand when From CMA is chosen.
                </p>
                {fields}
              </section>
            </CardContent>
          </>
        )}
      </SectionCard>
    </>
  );
}

// What the CMA-derived rates come from: the vintage and the day its data
// are as of, and how far it moved stocks' return from the vintage
// before, once there is one and both blend; or that none is pulled.
function sourceOf(
  cma: null | Vintages,
  targets: null | Targets,
  mappings: readonly Mapping[],
): string {
  if (cma === null) {
    return "No CMA pulled yet";
  }
  const dated = `${vintageName(cma.latest)} CMA, data as of ${formatDay(cma.latest.asOf)}`;
  const moved = stocksMoved(cma, targets, mappings);
  if (cma.previous === null || moved === null) {
    return dated;
  }
  const way = moved < 0 ? "down" : "up";
  return `${dated} · stocks ${way} ${formatPoints(Math.abs(moved), 2)} on ${vintageMonth(cma.previous)}`;
}

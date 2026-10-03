import type { JSX } from "react";

import type { RateSet as Chosen } from "@/data/rates";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { ScreenTabs } from "@/components/app/atoms/screen-tabs";
import { InflationSource } from "@/components/app/organisms/inflation-source";
import { RateSet } from "@/components/app/organisms/rate-set";
import { TargetAllocation } from "@/components/app/organisms/target-allocation";
import { formatPercent } from "@/lib/money";
import { assumptions, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

// What the header calls each set of rates.
const setNames: Record<Chosen, string> = {
  cma: "CMA-derived rates",
  custom: "custom rates",
};

// The assumptions the plan runs on, in two tabs. The first holds the
// rates: the set the plan runs on and the rates in it, the CMA-derived
// ones worked out from their sources or the ones and the split typed by
// hand, and beneath them the inflation source, over the curve last
// pulled from the Bank, which the derived rates take and the rates typed
// by hand set aside. The second holds the target
// allocation last imported from Portfolio Performance, with the class
// of the latest CMA each category is mapped onto. The header says what
// the plan grows at and what its prices rise by, made from the rates
// live, and which set those are, so the screen answers its question
// before a card is read, whichever tab is open. The page reads the
// store, which reads the session first, so it renders behind the
// loading screen beside it.
export default async function Assumptions(): Promise<JSX.Element> {
  const {
    allocation,
    cma,
    curve,
    deductions,
    mappings,
    plan,
    rates,
    rateSet,
    targets,
  } = await getHousehold();
  return (
    <>
      <ScreenHeader label={sectionLabel(assumptions)} title={assumptions.title}>
        {`Plan rate ${formatPercent(plan.rate)} · inflation ${formatPercent(plan.inflation)} · ${setNames[rateSet]}`}
      </ScreenHeader>
      <ScreenBody>
        <ScreenTabs
          tabs={[
            {
              children: (
                <>
                  <RateSet
                    allocation={allocation}
                    cma={cma}
                    curve={curve}
                    deductions={deductions}
                    mappings={mappings}
                    rates={rates}
                    rateSet={rateSet}
                    targets={targets}
                  />
                  <InflationSource curve={curve} />
                </>
              ),
              label: "Rates",
            },
            {
              children: (
                <TargetAllocation
                  cma={cma?.latest ?? null}
                  mappings={mappings}
                  targets={targets}
                />
              ),
              label: "Target allocation",
            },
          ]}
        />
      </ScreenBody>
    </>
  );
}

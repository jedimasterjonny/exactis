import type { JSX } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { ScreenTabs } from "@/components/app/atoms/screen-tabs";
import { AssetAllocation } from "@/components/app/organisms/asset-allocation";
import { InflationSource } from "@/components/app/organisms/inflation-source";
import { RateSet } from "@/components/app/organisms/rate-set";
import { TargetAllocation } from "@/components/app/organisms/target-allocation";
import { formatPercent } from "@/lib/money";
import { assumptions, sectionLabel } from "@/lib/nav";
import {
  getAllocation,
  getCurve,
  getPlan,
  getRates,
  getTargets,
} from "@/store/household";

// The assumptions the plan runs on, in two tabs. The first holds the
// rates: the rate set, the rates typed by hand beside where they come
// from, then how the savings are split between stocks and bonds, and
// beneath them the inflation source, over the curve last pulled from
// the Bank, which the rates typed by hand set aside. The second holds
// the target allocation last imported from Portfolio Performance. The
// header says what the plan grows at and what its prices rise by, both
// made from the rates typed by hand, so the screen answers its question
// before a card is read, whichever tab is open. The page reads the
// store, which reads the session first, so it renders behind the
// loading screen beside it.
export default async function Assumptions(): Promise<JSX.Element> {
  const [allocation, curve, plan, rates, targets] = await Promise.all([
    getAllocation(),
    getCurve(),
    getPlan(),
    getRates(),
    getTargets(),
  ]);
  return (
    <>
      <ScreenHeader label={sectionLabel(assumptions)} title={assumptions.title}>
        {`Plan rate ${formatPercent(plan.rate)} · inflation ${formatPercent(plan.inflation)} · custom rates`}
      </ScreenHeader>
      <ScreenBody>
        <ScreenTabs
          tabs={[
            {
              children: (
                <>
                  <RateSet rates={rates} />
                  <AssetAllocation allocation={allocation} rates={rates} />
                  <InflationSource curve={curve} />
                </>
              ),
              label: "Rates",
            },
            {
              children: <TargetAllocation targets={targets} />,
              label: "Target allocation",
            },
          ]}
        />
      </ScreenBody>
    </>
  );
}

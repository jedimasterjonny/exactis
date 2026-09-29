import type { JSX } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { InflationSource } from "@/components/app/organisms/inflation-source";
import { RateSet } from "@/components/app/organisms/rate-set";
import { formatPercent } from "@/lib/money";
import { assumptions, sectionLabel } from "@/lib/nav";
import { getCurve, getPlan, getRates } from "@/store/household";

// The assumptions the plan runs on: the rate set, the rates typed by
// hand beside where they come from, and beneath it the inflation
// source, over the curve last pulled from the Bank, which the rates
// typed by hand set aside. The header says what the plan grows at and
// what its prices rise by, both made from the rates typed by hand, so
// the screen answers its question before a card is read. The page
// reads the store, which reads the session first, so it renders behind
// the loading screen beside it.
export default async function Assumptions(): Promise<JSX.Element> {
  const [curve, plan, rates] = await Promise.all([
    getCurve(),
    getPlan(),
    getRates(),
  ]);
  return (
    <>
      <ScreenHeader label={sectionLabel(assumptions)} title={assumptions.title}>
        {`Plan rate ${formatPercent(plan.rate)} · inflation ${formatPercent(plan.inflation)} · custom rates`}
      </ScreenHeader>
      <ScreenBody>
        <RateSet rates={rates} />
        <InflationSource curve={curve} />
      </ScreenBody>
    </>
  );
}

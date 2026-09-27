import type { JSX } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { InflationSource } from "@/components/app/organisms/inflation-source";
import { inflationOf } from "@/data/inflation";
import { formatPercent } from "@/lib/money";
import { formatDay } from "@/lib/months";
import { assumptions, sectionLabel } from "@/lib/nav";
import { getCurve } from "@/store/household";

// The assumptions the plan runs on, a card each, of which so far there
// is the inflation source, over the curve last pulled from the Bank.
// The header says what the plan takes and the day of the curve it
// comes from, or that no curve has been pulled, so the screen answers
// its question before a card is read. The page reads the store, which
// reads the session first, so it renders behind the loading screen
// beside it.
export default async function Assumptions(): Promise<JSX.Element> {
  const curve = await getCurve();
  return (
    <>
      <ScreenHeader label={sectionLabel(assumptions)} title={assumptions.title}>
        {curve === null
          ? "No inflation curve pulled yet"
          : `Inflation ${formatPercent(inflationOf(curve).rate)} · gilt curve as at ${formatDay(curve.asOf)}`}
      </ScreenHeader>
      <ScreenBody>
        <InflationSource curve={curve} />
      </ScreenBody>
    </>
  );
}

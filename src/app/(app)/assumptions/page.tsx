import type { JSX } from "react";

import type { RateSet as Chosen } from "@/data/rates";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { SourceDates } from "@/components/app/atoms/source-dates";
import { ScreenTabs } from "@/components/app/molecules/screen-tabs";
import { GlidePath } from "@/components/app/organisms/glide-path";
import { InflationSource } from "@/components/app/organisms/inflation-source";
import { RateSet } from "@/components/app/organisms/rate-set";
import { StatePension } from "@/components/app/organisms/state-pension";
import { TargetAllocation } from "@/components/app/organisms/target-allocation";
import { laidOut } from "@/engine/projection";
import { formatPercent } from "@/lib/money";
import { today } from "@/lib/months";
import { assumptions, sectionLabel } from "@/lib/nav";
import { getHousehold, getSourcesDaysAgo } from "@/store/household";

// What the header calls each set of rates.
const setNames: Record<Chosen, string> = {
  cma: "CMA-derived rates",
  custom: "custom rates",
};

// The assumptions the plan runs on, under a strip saying how old each
// source they rest on is, in four tabs, the CMA's rates set beside the
// household's sources as they stood thirty days before, to say what has
// moved them since. The two are read together, and the sources then are
// handed on only while the CMA's rates are live, which is the only time
// the card reads them. The first holds the
// rates: the set the plan runs on and the rates in it, the CMA-derived
// ones worked out from their sources or the ones and the split typed by
// hand, the split shown as the glide path holds it now while it sets
// one, and beneath them the inflation source, over the curve last
// pulled from the Bank, which the derived rates take and the rates typed
// by hand set aside. The second holds the target
// allocation last imported from Portfolio Performance, with the class
// of the latest CMA each category is mapped onto, retargeted at the
// split the plan holds now unless that is the target allocation's own,
// as under the CMA's rates with no glide path. The third holds the
// glide path, the bond share by age it sets. The fourth holds the State
// Pension, each owner's qualifying years and what they earn, counted to
// the retirement the plan lays out as its own projection has it, as the
// plan screen lays it out. The header says what
// the plan grows at and what its prices rise by, made from the rates
// live, and which set those are, so the screen answers its question
// before a card is read, whichever tab is open. The tab the address
// names, as ?tab=glide-path does, is the one open as the screen opens.
// The page reads the store, which reads the session first, so it
// renders behind the loading screen beside it.
export default async function Assumptions({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<JSX.Element> {
  const [
    {
      accounts,
      allocation,
      cma,
      curve,
      deductions,
      glide,
      mappings,
      owners,
      plan,
      rates,
      rateSet,
      schedule,
      split,
      targets,
    },
    before,
    { tab },
  ] = await Promise.all([getHousehold(), getSourcesDaysAgo(30), searchParams]);
  const hasGlide = glide.length > 0;
  return (
    <>
      <ScreenHeader label={sectionLabel(assumptions)} title={assumptions.title}>
        {`Plan rate ${formatPercent(plan.rate)} · inflation ${formatPercent(plan.inflation)} · ${setNames[rateSet]}`}
      </ScreenHeader>
      <ScreenBody>
        <SourceDates
          cma={cma}
          curve={curve}
          deductions={deductions}
          targets={targets}
          today={today()}
        />
        <ScreenTabs
          open={typeof tab === "string" ? tab : undefined}
          tabs={[
            {
              children: (
                <>
                  <RateSet
                    allocation={hasGlide ? split : allocation}
                    before={rateSet === "cma" ? before : null}
                    cma={cma}
                    curve={curve}
                    deductions={deductions}
                    hasGlide={hasGlide}
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
                  split={rateSet === "cma" && !hasGlide ? null : split}
                  targets={targets}
                />
              ),
              label: "Target allocation",
            },
            {
              children: <GlidePath glide={glide} plan={plan} split={split} />,
              label: "Glide path",
            },
            {
              children: (
                <StatePension
                  owners={owners}
                  plan={laidOut(accounts, schedule, plan).plan}
                />
              ),
              label: "State pension",
            },
          ]}
        />
      </ScreenBody>
    </>
  );
}

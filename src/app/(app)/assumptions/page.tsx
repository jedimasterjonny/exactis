import type { Metadata } from "next";
import type { JSX } from "react";

import type { PortfolioTargetStatus } from "@/components/app/organisms/target-allocation";
import type { Household } from "@/data/household";
import type { RateSet as Chosen } from "@/data/rates";

import { SourceDates } from "@/components/app/atoms/source-dates";
import { ScreenTabs } from "@/components/app/molecules/screen-tabs";
import { GlidePath } from "@/components/app/organisms/glide-path";
import { InflationSource } from "@/components/app/organisms/inflation-source";
import { RateSet } from "@/components/app/organisms/rate-set";
import { StatePension } from "@/components/app/organisms/state-pension";
import { TargetAllocation } from "@/components/app/organisms/target-allocation";
import { Screen } from "@/components/app/templates/screen";
import { holdWhileLive } from "@/data/household";
import { effectiveSyncedOn } from "@/data/portfolio";
import { realRate } from "@/data/rates";
import {
  areTargetBookkeepingEqual,
  areTargetsEquivalent,
} from "@/data/targets";
import { laidOut } from "@/engine/projection";
import { answerOf } from "@/lib/answer";
import { formatPercent } from "@/lib/money";
import { today } from "@/lib/months";
import { assumptions, sectionLabel } from "@/lib/nav";
import { getHousehold, getOpened, getSourcesDaysAgo } from "@/store/household";
import { getPortfolioFeed } from "@/store/portfolio";

export const metadata: Metadata = { title: assumptions.label };

// What the header calls each set of rates.
const setNames: Record<Chosen, string> = {
  cma: "CMA-derived rates",
  custom: "Custom rates",
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
// allocation fed from the household's owned Portfolio Performance file,
// with the class of the latest CMA each category is mapped onto,
// retargeted at the split the plan holds now unless that is the target
// allocation's own, as under the CMA's rates with no glide path. The
// third holds the glide path, the bond share by age it sets. The fourth
// holds the State Pension, each owner's qualifying years and what they
// earn, counted to the retirement the plan lays out as its own
// projection has it, as the plan screen lays it out. The header names
// the set of rates live, and the body opens, above the strip and the
// tabs, on a sentence saying the plan rate, what it comes to in today's
// money at the plan's inflation, the rates worksheet's own real return,
// and that inflation, so the screen answers its question before a card
// is read, whichever tab is open; on a glide path the rate is the one it
// holds now, so the sentence says "now". No-break spaces bind "a year"
// and "today's money", so no line breaks inside either. The tab the
// address names, as ?tab=glide-path does, is the one open as the screen
// opens. The page reads the store, which reads the session first, so it
// renders behind the loading screen beside it.
export default async function Assumptions({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<JSX.Element> {
  const [household, before, opened, owned, { tab }] = await Promise.all([
    getHousehold(),
    getSourcesDaysAgo(30),
    getOpened(),
    getPortfolioFeed(),
    searchParams,
  ]);
  const {
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
  } = household;
  const hasGlide = glide.length > 0;
  const branch = opened?.isKept === true ? opened.name : null;
  const portfolioStatus = portfolioStatusOf(owned, household, branch !== null);
  return (
    <Screen
      label={sectionLabel(assumptions)}
      meta={setNames[rateSet]}
      title={assumptions.title}
    >
      <h2 className="heading text-2xl text-balance tabular-nums">
        {`The plan rate is ${formatPercent(plan.rate)} a\u00a0year${hasGlide ? " now" : ""}, ${formatPercent(realRate(plan.rate, plan.inflation))} in today's\u00a0money at ${formatPercent(plan.inflation)} inflation.`}
      </h2>
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
                branch={branch}
                cma={cma?.latest ?? null}
                mappings={mappings}
                portfolioStatus={portfolioStatus}
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
    </Screen>
  );
}

// Compares the household's owned .portfolio feed against the open
// branch's saved target allocation, distinguishing intentional scenario
// retargets (same bookkeeping, different shares) from unsynced updates
// and evaluating live-CMA sync blockers when saved targets exist.
function portfolioStatusOf(
  owned: Awaited<ReturnType<typeof getPortfolioFeed>>,
  household: Household,
  isInScenario: boolean,
): PortfolioTargetStatus {
  if (owned === null) {
    return { kind: "missing" };
  }
  if (owned.feed.targets.kind === "refused") {
    return {
      fileName: owned.fileName,
      kind: "refused",
      reason: owned.feed.targets.reason,
    };
  }
  const live = owned.feed.targets.value;
  if (areTargetsEquivalent(household.targets, live)) {
    return { fileName: owned.fileName, kind: "synced", version: owned.version };
  }
  if (
    isInScenario &&
    household.targets !== null &&
    areTargetBookkeepingEqual(household.targets, live)
  ) {
    return {
      fileName: owned.fileName,
      kind: "retargeted",
      version: owned.version,
    };
  }
  const blocked =
    household.targets === null
      ? null
      : answerOf(() => {
          holdWhileLive(
            {
              ...household,
              targets: {
                categories: live.categories,
                importedOn: effectiveSyncedOn({
                  latestQuoteDate: owned.feed.latestQuoteDate,
                  latestTransactionDate: owned.feed.latestTransactionDate,
                  savedOn: owned.savedOn,
                }),
                portfolios: live.portfolios,
              },
            },
            {
              cannot: "this allocation cannot be synced",
              then: "sync it and give its new categories a class",
            },
          );
        });
  const blockedReason =
    blocked?.kind === "refused" ? blocked.reason : undefined;
  return {
    ...(blockedReason !== undefined && { blockedReason }),
    fileName: owned.fileName,
    kind: "unsynced",
    version: owned.version,
  };
}

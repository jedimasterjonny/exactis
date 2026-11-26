import type { Metadata } from "next";
import type { JSX } from "react";

import type { Household } from "@/data/household";
import type { Month } from "@/data/schedule";

import { holdWhileLive } from "@/data/household";
import { effectiveSyncedOn } from "@/data/portfolio";
import { isDue } from "@/data/progress";
import { areTargetsEquivalent } from "@/data/targets";
import { answerOf } from "@/lib/answer";
import { closingOn, cutOf, today } from "@/lib/months";
import { monthEnd } from "@/lib/nav";
import {
  getClosesBack,
  getHousehold,
  getOpened,
  getSinceClose,
} from "@/store/household";
import { getPortfolioFeed } from "@/store/portfolio";

import type { ClosePortfolio } from "./close-screen";

import { CloseScreen } from "./close-screen";

export const metadata: Metadata = { title: monthEnd.label };

// The month end, read from the store behind the session: the household,
// whether a scenario is open, the owned portfolio feed while outside a
// scenario, and, only where the screen will compare it, the household as
// the close before the latest left it: not while a scenario is open, nor
// while the month cut last is to be closed, nor while the balances are
// being updated, as ?update asks; and once that close is read, the
// closes kept in the year before the latest, handed on unread for the
// screen to read behind a boundary of their own. The page renders
// behind the loading screen beside it, and the day is read once, on the
// server, with the month whose balances it cut last.
export default async function Close({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<JSX.Element> {
  const [household, opened, { update }] = await Promise.all([
    getHousehold(),
    getOpened(),
    searchParams,
  ]);
  const day = today();
  const month = closingOn(day);
  const isUpdating = update !== undefined;
  const isComparing =
    opened === null && !isUpdating && !isDue(household.points, month);
  const [since, owned] = await Promise.all([
    isComparing ? getSinceClose() : null,
    opened === null ? getPortfolioFeed() : null,
  ]);
  return (
    <CloseScreen
      closes={since === null ? null : getClosesBack()}
      household={household}
      isInScenario={opened !== null}
      isUpdating={isUpdating}
      month={month}
      portfolio={portfolioOf(owned, household, month)}
      since={since}
      today={day}
    />
  );
}

// Summarizes the household's owned portfolio file for the month cut
// last: its freshness dates paired with whether its target allocation
// is refused, synced for this close, or unsynced (with any live-CMA
// sync blocker evaluated against the household's current settings).
function portfolioOf(
  owned: Awaited<ReturnType<typeof getPortfolioFeed>>,
  household: Household,
  month: Month,
): ClosePortfolio | null {
  if (owned === null) {
    return null;
  }
  const base = {
    latestQuoteDate: owned.feed.latestQuoteDate,
    latestTransactionDate: owned.feed.latestTransactionDate,
    savedOn: owned.savedOn,
  };
  if (owned.feed.targets.kind === "refused") {
    return { ...base, kind: "refused", reason: owned.feed.targets.reason };
  }
  const live = owned.feed.targets.value;
  const syncedOn = effectiveSyncedOn(base);
  if (
    household.targets !== null &&
    areTargetsEquivalent(household.targets, live) &&
    (syncedOn < cutOf(month) || household.targets.importedOn >= cutOf(month))
  ) {
    return { ...base, kind: "synced", targets: household.targets };
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
                importedOn: syncedOn,
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
    ...base,
    ...(blockedReason !== undefined && { blockedReason }),
    kind: "unsynced",
  };
}

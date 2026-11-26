import type { Metadata } from "next";
import type { JSX } from "react";

import * as z from "zod";

import type { Household } from "@/data/household";

import { blendsOf } from "@/data/cma";
import { holdWhileLive } from "@/data/household";
import { effectiveSyncedOn } from "@/data/portfolio";
import {
  areTargetBookkeepingEqual,
  areTargetsEquivalent,
} from "@/data/targets";
import { laidOut, monthsOn } from "@/engine/projection";
import { answerOf } from "@/lib/answer";
import { today } from "@/lib/months";
import { investedIn } from "@/lib/moved";
import { cogitator } from "@/lib/nav";
import { getHousehold, getOpened } from "@/store/household";
import { getPortfolioFeed } from "@/store/portfolio";

import type { CogitatorPortfolio } from "./cogitator-screen";

import { CogitatorScreen } from "./cogitator-screen";

export const metadata: Metadata = { title: cogitator.label };

// An amount the month end offers, as its link writes it: whole pounds,
// something, the month whose close paid it in, as year and month, and
// the securities account it is held in, by name, where it says one.
const offer = z.object({
  account: z.string().min(1).optional(),
  amount: z.coerce.number().int().positive(),
  from: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .transform((from) => ({
      month: Number(from.slice(5)) - 1,
      year: Number(from.slice(0, 4)),
    })),
});

// The next best trades, over the target allocation last synced from the
// household's owned portfolio file and what each category of it holds,
// read from the store behind the session alongside the owned portfolio
// feed and whether a scenario is open. What to trade for is chosen on
// the screen and the trades laid out in the browser as it is, so the
// screen beside this route holds it. The screen is told what the plan
// holds in bonds now beside what the target allocation holds, while the
// two differ by a whole point, as the screens show them; the target
// allocation's is read off the latest vintage's blends, since only a
// CMA class says which sleeve a category is in, so with no CMA, or none
// it can blend, nothing is said. An amount the month end offers in the
// address, as ?amount=1250&from=2026-08 does, is handed on with the
// month it came from, and with the account it is held in where
// ?account= names one; one the address holds that is not such an amount
// is left. Without an offer the screen is handed what the plan pays
// into the ISAs and GIA in its first month, in whole pounds, as the
// month end reads what its months paid in, with the month, where it
// pays them anything; and where it pays nothing the amount opens at
// nothing. The screen holds the amount it opens on as its own, so it is
// drawn afresh whenever the offer or the plan's figure changes, as
// leaving the month end's link for the bare address does, which Next
// draws without remounting it; otherwise the offered amount would stay
// while its mark went. The day is read once the store has been, as the
// assumptions screen reads it, for how old the portfolio freshness date
// is. The page renders behind the loading screen beside it.
export default async function Cogitator({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<JSX.Element> {
  const [household, opened, owned, address] = await Promise.all([
    getHousehold(),
    getOpened(),
    getPortfolioFeed(),
    searchParams,
  ]);
  const { accounts, cma, mappings, plan, schedule, split, targets } = household;
  const branch = opened?.isKept === true ? opened.name : null;
  const portfolio = portfolioOf(owned, household, branch !== null);
  const blends = cma === null ? null : blendsOf(cma.latest, targets, mappings);
  const targeted =
    blends === null || "short" in blends ? null : blends.bonds.share;
  const now = 1 - split.stocks;
  const offered = offer.safeParse(address);
  const laid = laidOut(accounts, schedule, plan);
  const paying = investedIn(
    monthsOn(accounts, laid.schedule, { months: 1, plan: laid.plan }),
  );
  return (
    <CogitatorScreen
      key={offered.success ? JSON.stringify(offered.data) : String(paying)}
      {...(targeted !== null &&
        Math.round(targeted * 100) !== Math.round(now * 100) && {
          bonds: { now, targeted },
        })}
      branch={branch}
      {...(offered.success && {
        offered: {
          ...(offered.data.account !== undefined && {
            account: offered.data.account,
          }),
          amount: offered.data.amount,
          month: offered.data.from,
        },
      })}
      {...(!offered.success &&
        paying > 0 && {
          planned: {
            amount: paying,
            month: { month: laid.plan.month, year: laid.plan.from },
          },
        })}
      portfolio={portfolio}
      targets={targets}
      today={today()}
    />
  );
}

// Summarizes the household's owned .portfolio feed against the open
// branch's saved targets: handoff lookups and freshness dates paired
// with whether the allocation is synced, intentionally retargeted in a
// scenario (same bookkeeping, different shares), refused, or unsynced
// (with any live-CMA sync blocker evaluated outside a scenario when
// saved targets exist).
function portfolioOf(
  owned: Awaited<ReturnType<typeof getPortfolioFeed>>,
  household: Household,
  isInScenario: boolean,
): CogitatorPortfolio | null {
  if (owned === null) {
    return null;
  }
  const base = {
    handoff: owned.feed.handoff,
    latestQuoteDate: owned.feed.latestQuoteDate,
    savedOn: owned.savedOn,
  };
  if (owned.feed.targets.kind === "refused") {
    return {
      ...base,
      syncRefusal: owned.feed.targets.reason,
      syncState: "refused",
    };
  }
  const live = owned.feed.targets.value;
  if (areTargetsEquivalent(household.targets, live)) {
    return { ...base, syncState: "synced" };
  }
  if (
    isInScenario &&
    household.targets !== null &&
    areTargetBookkeepingEqual(household.targets, live)
  ) {
    return { ...base, syncState: "retargeted" };
  }
  const blocked =
    isInScenario || household.targets === null
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
    ...base,
    ...(blockedReason !== undefined && { blockedReason }),
    syncState: "unsynced",
  };
}

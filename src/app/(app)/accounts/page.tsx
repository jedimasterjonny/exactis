import type { Metadata } from "next";
import type { JSX } from "react";

import { CalendarCheck } from "lucide-react";
import Link from "next/link";

import type { PortfolioRate } from "@/components/app/organisms/account-fields";

import { BalanceDates } from "@/components/app/atoms/balance-dates";
import { Screen } from "@/components/app/templates/screen";
import { buttonVariants } from "@/components/kit/button";
import { accountGrowthOf } from "@/data/cma";
import { moveChoices } from "@/data/houses";
import { markersOf } from "@/data/milestones";
import { laidOut } from "@/engine/projection";
import { balanceOf, drawingTaxOf } from "@/lib/ledger";
import { formatGbp } from "@/lib/money";
import { formatMonth, monthBefore, today } from "@/lib/months";
import { accountsAndAssets, monthEnd, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";
import { getPortfolioFeed } from "@/store/portfolio";

import { AccountLedger } from "./account-ledger";

export const metadata: Metadata = { title: accountsAndAssets.label };

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers, cash and the loans on one, the real assets on the
// other. The page reads the accounts from the store, the income lines
// with them, so the ledger can name the salaries feeding a pension
// before it goes and say what they feed it, the expense lines, so it
// can say when each loan's payments clear it, and the owners and the
// children, for the sections listing them; the read checks the session
// first, so the page renders behind the loading screen beside it and
// the rest of the shell
// does not wait for any of them. The plan is read beside them, for the
// month the ledger counts the salaries in, which is the month the plan
// starts in, and the rate the savings grow at, laid out as its own
// projection has it, so an owner already past the conditions they
// retire on earns no salary in that month, and the milestones it is
// laid out by that a house may move at, for the one it moves at. The header is the
// page's, as the plan screen's is, since it reads that month: it says
// the month the balances are as of, the one before the plan starts in,
// at whose end they were read, and links to the month end, which moves
// the month on and checks the balances against it. The body opens on a
// sentence saying the net worth the plan starts from, what the balances
// come to once the pensions are counted at what drawing them would
// leave, which is the balance sheet's own total and what the plan's
// first year opens on, as the other screens open on their answers; with
// no account there is no sentence, since the sheet's empty state says
// it. No-break spaces bind "a net worth", so no line breaks inside it.
// Beneath the sentence the strip says how fresh the balances are, as
// the assumptions screen's says how fresh its sources are, over the
// sections the ledger lays out. Beside the household, the page reads
// the stored Portfolio Performance feed to gather live securities
// account candidates (falling back to synced target portfolios when no
// feed is stored) and derives bespoke or fallback CMA rate previews
// for live and stale links. The day is read once on the server.
export default async function Accounts(): Promise<JSX.Element> {
  const [household, owned] = await Promise.all([
    getHousehold(),
    getPortfolioFeed(),
  ]);
  const { accounts, owners } = household;
  const { plan, schedule } = laidOut(
    accounts,
    household.schedule,
    household.plan,
  );
  const portfolios = [
    ...new Set(
      [
        ...(owned === null
          ? (household.targets?.portfolios?.map(({ name }) => name) ?? [])
          : owned.feed.handoff.securitiesAccounts.map(({ name }) => name)),
        ...(household.targets?.categories.flatMap(
          ({ accounts: held }) => held?.map(({ name }) => name) ?? [],
        ) ?? []),
      ]
        .map((name) => name.trim())
        .filter((name) => name !== ""),
    ),
  ].toSorted((one, other) => one.localeCompare(other));
  const live = new Set(portfolios);
  const candidateNames = new Set([
    ...portfolios,
    ...accounts.flatMap(({ portfolio }) =>
      portfolio === undefined ? [] : [portfolio],
    ),
  ]);
  const portfolioRates: Readonly<Record<string, PortfolioRate>> =
    Object.fromEntries(
      [...candidateNames].map((name): readonly [string, PortfolioRate] => {
        if (!live.has(name)) {
          return [name, { kind: "fallback", reason: "Not found in Portfolio" }];
        }
        const derived = accountGrowthOf(household, plan, name);
        return [
          name,
          derived.kind === "bespoke"
            ? {
                kind: "bespoke",
                rate: derived.rate.rate,
                stocks: derived.stocks,
              }
            : { kind: "fallback", reason: derived.reason },
        ];
      }),
    );
  const day = today();
  return (
    <Screen
      actions={
        <Link className={buttonVariants({ size: "sm" })} href={monthEnd.href}>
          <CalendarCheck aria-hidden />
          Update balances
        </Link>
      }
      label={sectionLabel(accountsAndAssets)}
      meta={`Balances as of the end of ${formatMonth(monthBefore({ month: plan.month, year: plan.from }))}`}
      title={accountsAndAssets.title}
    >
      {accounts.length > 0 && (
        <h2 className="heading text-2xl text-balance tabular-nums">
          {`The plan starts from a\u00a0net\u00a0worth of ${formatGbp(balanceOf(accounts) - drawingTaxOf(accounts))}.`}
        </h2>
      )}
      <BalanceDates accounts={accounts} today={day} />
      <AccountLedger
        accounts={accounts}
        expenses={schedule.expenses}
        kids={household.children}
        lines={schedule.income}
        milestones={moveChoices(
          markersOf(household.milestones, plan),
          plan,
          accounts,
        )}
        owners={owners}
        plan={plan}
        portfolio={{
          accounts: portfolios,
          hasGlide: household.glide.length > 0,
          planRate: plan.rate,
          rates: portfolioRates,
        }}
      />
    </Screen>
  );
}

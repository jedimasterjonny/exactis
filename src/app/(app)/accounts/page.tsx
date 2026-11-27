import type { Metadata } from "next";
import type { JSX } from "react";

import { CalendarCheck } from "lucide-react";
import Link from "next/link";

import type {
  PortfolioOptions,
  PortfolioRate,
} from "@/components/app/organisms/account-fields";
import type { Household } from "@/data/household";
import type { Plan } from "@/data/plan";
import type { PortfolioFeed } from "@/data/portfolio";

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

const listFormat = new Intl.ListFormat("en-GB");

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
  const portfolio = portfolioOptionsOf(household, plan, owned?.feed ?? null);
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
        portfolio={portfolio}
      />
    </Screen>
  );
}

function countByTrimmedName(
  items: readonly { readonly name: string }[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.name.trim();
    if (key !== "") {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function growthRateOf(
  household: Household,
  plan: Plan,
  name: string,
): PortfolioRate {
  const derived = accountGrowthOf(household, plan, name);
  return derived.kind === "bespoke"
    ? { kind: "bespoke", rate: derived.rate.rate, stocks: derived.stocks }
    : { kind: "fallback", reason: derived.reason };
}

// Builds the Portfolio account dropdown options and per-name preview
// statuses for /accounts from the stored .portfolio feed (or synced
// household targets when no file is stored).
function portfolioOptionsOf(
  household: Household,
  plan: Plan,
  feed: null | PortfolioFeed,
): PortfolioOptions {
  const linkedNames = household.accounts.flatMap(({ portfolio }) =>
    portfolio === undefined ? [] : [portfolio],
  );
  if (feed === null) {
    const categoryAccountNames = (
      household.targets?.categories.flatMap(
        ({ accounts: held }) => held?.map(({ name }) => name) ?? [],
      ) ?? []
    )
      .map((name) => name.trim())
      .filter((name) => name !== "");
    const targetNames = [
      ...new Set([
        ...(household.targets?.portfolios
          ?.map(({ name }) => name.trim())
          .filter((name) => name !== "") ?? []),
        ...categoryAccountNames,
      ]),
    ].toSorted((one, other) => one.localeCompare(other));
    const live = new Set(targetNames);
    const rates = Object.fromEntries(
      [...new Set([...targetNames, ...linkedNames])].map(
        (name): readonly [string, PortfolioRate] => [
          name,
          live.has(name.trim())
            ? growthRateOf(household, plan, name)
            : unavailableRateOf(name, "Not found in Portfolio", {
                household,
                plan,
              }),
        ],
      ),
    );
    return {
      accounts: targetNames,
      cashAccounts: [],
      hasGlide: household.glide.length > 0,
      hasLivePortfolio: false,
      planRate: plan.rate,
      rates,
    };
  }

  const activeSecurities = feed.accounts.securities.filter(
    (account) => !account.isRetired,
  );
  const activeCash = feed.accounts.cash.filter((account) => !account.isRetired);
  const activeStandaloneCash = activeCash.filter(
    (account) => account.referencedBy.length === 0,
  );
  const secCounts = countByTrimmedName(activeSecurities);
  const cashCounts = countByTrimmedName(activeStandaloneCash);
  const securitiesNames = [...secCounts.keys()].toSorted((one, other) =>
    one.localeCompare(other),
  );
  const cashNames = [...cashCounts.keys()]
    .filter((name) => !secCounts.has(name))
    .toSorted((one, other) => one.localeCompare(other));
  const retiredHeldSecuritiesNames = new Set(
    feed.accounts.securities
      .filter((account) => account.isRetired && account.holdingsCount > 0)
      .map((account) => account.name.trim())
      .filter((name) => name !== ""),
  );
  const pairedCashByName = new Map<string, Set<string>>();
  for (const account of activeCash) {
    const key = account.name.trim();
    if (key !== "" && account.referencedBy.length > 0) {
      const names = pairedCashByName.get(key) ?? new Set<string>();
      for (const refName of account.referencedBy) {
        names.add(refName);
      }
      pairedCashByName.set(key, names);
    }
  }
  const retiredNames = new Set(
    [
      ...feed.accounts.securities.filter((account) => account.isRetired),
      ...feed.accounts.cash.filter((account) => account.isRetired),
    ]
      .map((account) => account.name.trim())
      .filter((name) => name !== ""),
  );

  const candidateNames = new Set([
    ...securitiesNames,
    ...cashNames,
    ...linkedNames,
  ]);
  const rates = Object.fromEntries(
    [...candidateNames].map((name): readonly [string, PortfolioRate] => [
      name,
      resolveFeedPortfolioRate(name.trim(), {
        cashCounts,
        household,
        pairedCashByName,
        plan,
        retiredHeldSecuritiesNames,
        retiredNames,
        secCounts,
      }),
    ]),
  );

  return {
    accounts: securitiesNames,
    cashAccounts: cashNames,
    hasGlide: household.glide.length > 0,
    hasLivePortfolio: true,
    planRate: plan.rate,
    rates,
  };
}

function resolveFeedPortfolioRate(
  key: string,
  {
    cashCounts,
    household,
    pairedCashByName,
    plan,
    retiredHeldSecuritiesNames,
    retiredNames,
    secCounts,
  }: {
    readonly cashCounts: ReadonlyMap<string, number>;
    readonly household: Household;
    readonly pairedCashByName: ReadonlyMap<string, ReadonlySet<string>>;
    readonly plan: Plan;
    readonly retiredHeldSecuritiesNames: ReadonlySet<string>;
    readonly retiredNames: ReadonlySet<string>;
    readonly secCounts: ReadonlyMap<string, number>;
  },
): PortfolioRate {
  const secCount = secCounts.get(key) ?? 0;
  const cashCount = cashCounts.get(key) ?? 0;
  const isColliding =
    secCount > 1 ||
    cashCount > 1 ||
    (secCount > 0 && cashCount > 0) ||
    (secCount === 0 && cashCount > 0 && retiredHeldSecuritiesNames.has(key));
  if (isColliding) {
    return unavailableRateOf(
      key,
      "Multiple Portfolio accounts share this name",
      { household, plan },
    );
  }
  if (secCount === 1) {
    return growthRateOf(household, plan, key);
  }
  if (cashCount === 1) {
    return { kind: "cash" };
  }
  const paired = pairedCashByName.get(key);
  if (paired !== undefined) {
    return unavailableRateOf(
      key,
      `Paired as reference cash for ${listFormat.format([...paired])}`,
      { household, plan },
    );
  }
  if (retiredNames.has(key)) {
    return unavailableRateOf(key, "Retired in Portfolio", { household, plan });
  }
  return unavailableRateOf(key, "Not found in Portfolio", { household, plan });
}

function unavailableRateOf(
  name: string,
  reason: string,
  { household, plan }: { readonly household: Household; readonly plan: Plan },
): PortfolioRate {
  const derived = accountGrowthOf(household, plan, name);
  return derived.kind === "bespoke"
    ? {
        bespoke: { rate: derived.rate.rate, stocks: derived.stocks },
        kind: "unavailable",
        reason,
      }
    : { kind: "unavailable", reason };
}

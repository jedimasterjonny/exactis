"use client";

import type { JSX } from "react";

import { Briefcase } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { PortfolioHandoff } from "@/data/portfolio";
import type { Month } from "@/data/schedule";
import type { Targets } from "@/data/targets";

import {
  CountField,
  MoneyField,
} from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { Screen } from "@/components/app/templates/screen";
import { Badge } from "@/components/kit/badge";
import { buttonVariants } from "@/components/kit/button";
import { formatGbp } from "@/lib/money";
import { formatDated, formatDay, monthName } from "@/lib/months";
import {
  cogitator,
  portfolio as portfolioScreen,
  sectionLabel,
} from "@/lib/nav";

import { CogitatorBoard } from "./cogitator-board";

// How the household's owned .portfolio file stands for Cogitator: its
// handoff lookups and freshness dates together with whether its target
// allocation is synced, intentionally retargeted in a scenario, refused,
// or unsynced (with an optional live-CMA sync blocker).
export type CogitatorPortfolio = (
  | { readonly blockedReason?: string; readonly syncState: "unsynced" }
  | { readonly syncRefusal: string; readonly syncState: "refused" }
  | { readonly syncState: "retargeted" | "synced" }
) & {
  readonly handoff: PortfolioHandoff;
  readonly latestQuoteDate: null | string;
  readonly savedOn: string;
};

interface CogitatorScreenProps {
  readonly bonds?: { readonly now: number; readonly targeted: number };
  readonly branch: null | string;
  readonly offered?: {
    readonly account?: string;
    readonly amount: number;
    readonly month: Month;
  };
  readonly planned?: { readonly amount: number; readonly month: Month };
  readonly portfolio: CogitatorPortfolio | null;
  readonly targets: null | Targets;
  readonly today: string;
}

// The next best trades for the pounds typed in the header. The header
// shows how fresh the household's owned portfolio file is (or when a
// legacy allocation was synced before a file is uploaded), what the
// allocation holds in all, and a link to Portfolio; and it takes the
// amount to invest and the most sales to make once there is something
// to buy toward, the sales held to a few, since every choice of them is
// tried; and, once the allocation says what each securities account
// holds, which account the trades are placed in, all of them until one
// is chosen, the accounts listed by name. All three are the screen's
// own and forgotten when it is left, since they are chosen afresh at
// each visit to the broker, so they are held here, beside the route,
// where both the header that takes them and the board beneath that lays
// out the trades for them can reach them. All accounts is the choice of
// no name, so an account read from a file with none is not offered. An
// account chosen that the allocation no longer lists, as one does once
// a scenario with another is opened, which keeps the screen, is all
// accounts again, and stays so should it be listed again, as the choice
// by then shows. The amount and sales fields show those held, and the
// account choice opens on the account held, so each says what the
// ladder is making when it comes back after the allocation had nothing
// to buy toward. An amount the month end offered opens the amount at it
// rather than at nothing, and the field says what it was and which
// month's close it came from, so a figure is never there unexplained;
// it is typed over as any amount is, and the field still says what was
// offered, so the line stays true and the header keeps its height.
// Without an offer, what the plan pays into the ISAs and GIA in its
// first month opens the amount where the page hands it on, and the
// field says so, its figure and for which month, the same way. One
// offered in an account opens the account choice on it, or on all
// accounts where the allocation does not list it. The fields line up by
// their labels, so the amount's hint beneath its box sets the others no
// lower.
export function CogitatorScreen({
  bonds,
  branch,
  offered,
  planned,
  portfolio,
  targets,
  today,
}: CogitatorScreenProps): JSX.Element {
  const [amount, setAmount] = useState(offered?.amount ?? planned?.amount ?? 0);
  const [sales, setSales] = useState(0);
  const [account, setAccount] = useState(offered?.account ?? "");
  const categories = targets?.categories ?? [];
  const accounts = [
    ...new Set(
      categories.flatMap((category) =>
        (category.accounts ?? []).map(({ name }) => name),
      ),
    ),
  ]
    .filter((name) => name !== "")
    .toSorted((one, other) => one.localeCompare(other));
  if (account !== "" && !accounts.includes(account)) {
    setAccount("");
  }
  const held = categories.reduce((sum, { value }) => sum + value, 0);
  const isReady =
    held > 0 &&
    categories.some(({ isImplemented, share }) => isImplemented && share > 0);
  return (
    <Screen
      actions={
        isReady ? (
          <div className="flex flex-wrap items-start gap-2">
            <MoneyField
              hint={hintOf(offered, planned)}
              label="Amount to invest"
              min={0}
              onValueCommitted={setAmount}
              value={amount}
            />
            <CountField
              label="Sales at most"
              max={5}
              min={0}
              onValueCommitted={setSales}
              value={sales}
            />
            {accounts.length > 0 && (
              <SelectField
                defaultValue={account}
                label="Account"
                onValueChange={setAccount}
                options={[
                  { label: "All accounts", value: "" },
                  ...accounts.map((name) => ({ label: name, value: name })),
                ]}
              />
            )}
          </div>
        ) : undefined
      }
      label={sectionLabel(cogitator)}
      meta={
        portfolio !== null ? (
          <>
            <Badge
              className="h-auto max-w-full whitespace-normal"
              variant="secondary"
            >
              <Briefcase aria-hidden />
              {portfolio.latestQuoteDate !== null
                ? `Quotes to ${formatPortfolioDate(portfolio.latestQuoteDate, today)}`
                : `Saved ${formatPortfolioDate(portfolio.savedOn, today)}`}
            </Badge>
            {targets !== null && `${formatGbp(held)} held`}
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={portfolioScreen.href}
            >
              Open Portfolio
            </Link>
          </>
        ) : (
          <>
            {targets !== null && (
              <>
                <Badge
                  className="h-auto max-w-full whitespace-normal"
                  variant="secondary"
                >
                  <Briefcase aria-hidden />
                  {`Synced ${formatPortfolioDate(targets.importedOn, today)}`}
                </Badge>
                {`${formatGbp(held)} held`}
              </>
            )}
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={portfolioScreen.href}
            >
              Upload on Portfolio
            </Link>
          </>
        )
      }
      title={cogitator.title}
    >
      <CogitatorBoard
        account={account}
        amount={amount}
        {...(bonds !== undefined && { bonds })}
        branch={branch}
        held={held}
        isReady={isReady}
        portfolio={portfolio}
        sales={sales}
        targets={targets}
      />
    </Screen>
  );
}

// Formats a portfolio freshness date with relative age unless timezone
// skew puts the date ahead of today, in which case the date is shown
// plainly rather than with a negative day count.
function formatPortfolioDate(date: string, today: string): string {
  return date > today ? formatDay(date) : formatDated(date, today);
}

// What the amount field says of the figure it opened on: the close it
// came from and its figure while the month end offered it, or the plan's
// figure and month, whatever is typed over it.
function hintOf(
  offered: CogitatorScreenProps["offered"],
  planned: CogitatorScreenProps["planned"],
): string | undefined {
  if (offered !== undefined) {
    return `${formatGbp(offered.amount)} from ${monthName(offered.month.month, "long")}'s close`;
  }
  if (planned !== undefined) {
    return `${formatGbp(planned.amount)} planned for the ISAs and GIA in ${monthName(planned.month.month, "long")}`;
  }
  return undefined;
}

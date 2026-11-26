import type { JSX } from "react";

import { Briefcase } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import type { Household } from "@/data/household";
import type { Month } from "@/data/schedule";
import type { PortfolioFreshness } from "@/lib/sources";

import { CmaPull } from "@/components/app/atoms/cma-pull";
import { CurvePull } from "@/components/app/atoms/curve-pull";
import { PortfolioSync } from "@/components/app/atoms/portfolio-sync";
import { HousePricesPull } from "@/components/app/molecules/house-prices-pull";
import { Badge } from "@/components/kit/badge";
import { buttonVariants } from "@/components/kit/button";
import { vintageMonth } from "@/data/cma";
import { formatDated, formatDay, formatMonthShort } from "@/lib/months";
import { portfolio as portfolioScreen } from "@/lib/nav";
import { formatPortfolioDates, sourcesOf } from "@/lib/sources";

// How the household's owned portfolio file stands for the month end:
// its freshness dates together with whether its target allocation is
// synced, refused to read, or holding unsynced changes (with an
// optional live-CMA blocker).
export type PortfolioSource = PortfolioFreshness &
  (
    | { readonly blockedReason?: string; readonly kind: "unsynced" }
    | { readonly kind: "refused"; readonly reason: string }
    | { readonly kind: "synced" }
  );

// A source the month end offers, by the rule's name for it.
type Offered = ReturnType<typeof sourcesOf>[number]["source"];

// What a source's row says: its name, optional caution badge, the line
// saying what is held and how old it is, optional note beneath, and its
// action.
interface Row {
  readonly badge?: "Not synced" | "Stale";
  readonly line: string;
  readonly name: string;
  readonly note?: string;
  readonly pull: JSX.Element;
}

interface SourcePullsProps {
  readonly household: Pick<
    Household,
    "accounts" | "cma" | "curve" | "housePrices" | "rateSet"
  >;
  readonly month: Month;
  readonly portfolio: null | PortfolioSource;
  readonly today: string;
}

// The sources the month end's balances rest on, at the head of its
// worksheet, so they are checked before the balances are entered: a
// section ruled off from the fields beneath it, named Sources, with a
// row for each source the month's rule offers, in its order. Each row
// is a group named by its name, with a caution badge saying Stale where
// a newer release or fresher portfolio data should be out, or Not
// synced where a fresh portfolio file has not yet synced its target
// allocation, so whoever tabs to its action hears which source it is
// for and its state; beneath the name, the line saying what is held or
// that it is not pulled or uploaded yet, its action beside the line
// where the section is wide enough and beneath it where it is not, and
// any refusal or sync blocker note below. Nothing is required: every
// action is offered whether stale or not, and the save reads none of
// it. The house price pull is never held here, since the month end is
// closed only outside a scenario. The day it is is given rather than
// read, so the ages draw the same on the server as in a test.
export function SourcePulls({
  household,
  month,
  portfolio,
  today,
}: SourcePullsProps): JSX.Element {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="@container grid gap-3 border-b pb-4"
    >
      <h3 className="label text-muted-foreground" id={id}>
        Sources
      </h3>
      <div className="grid gap-4">
        {sourcesOf(household, month, portfolio).map(({ isStale, source }) => (
          <SourceRow
            household={household}
            isStale={isStale}
            key={source}
            portfolio={portfolio}
            source={source}
            today={today}
          />
        ))}
      </div>
    </section>
  );
}

// The portfolio source row: upload link when none is stored, open link
// with Not synced and refusal note when unreadable, open link with
// Stale when behind the month's cut, and sync actions or open link when
// current.
function portfolioRowOf({
  isStale,
  noteId,
  portfolio,
}: {
  readonly isStale: boolean;
  readonly noteId: string;
  readonly portfolio: null | PortfolioSource;
}): Row {
  if (portfolio === null) {
    return {
      line: "Not uploaded yet",
      name: "Portfolio",
      pull: (
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href={portfolioScreen.href}
        >
          <Briefcase aria-hidden />
          Upload on Portfolio
        </Link>
      ),
    };
  }
  const line = formatPortfolioDates(portfolio);
  const openLink = (
    <Link
      className={buttonVariants({ size: "sm", variant: "outline" })}
      href={portfolioScreen.href}
    >
      <Briefcase aria-hidden />
      Open Portfolio
    </Link>
  );
  if (portfolio.kind === "refused") {
    return {
      badge: "Not synced",
      line,
      name: "Portfolio",
      note: portfolio.reason,
      pull: openLink,
    };
  }
  if (isStale) {
    return { badge: "Stale", line, name: "Portfolio", pull: openLink };
  }
  switch (portfolio.kind) {
    case "synced": {
      return { line, name: "Portfolio", pull: openLink };
    }
    case "unsynced": {
      const { blockedReason } = portfolio;
      return {
        badge: "Not synced",
        line,
        name: "Portfolio",
        ...(blockedReason !== undefined && { note: blockedReason }),
        pull: (
          <div className="flex flex-wrap items-center gap-2">
            <PortfolioSync
              {...(blockedReason !== undefined && {
                describedBy: noteId,
                isDisabled: true,
              })}
              branch={null}
            />
            {openLink}
          </div>
        ),
      };
    }
  }
}

// A source's row as the household holds it, on the day given.
function rowOf(
  source: Offered,
  {
    household: { cma, curve, housePrices },
    isStale,
    noteId,
    portfolio,
    today,
  }: Pick<SourcePullsProps, "household" | "portfolio" | "today"> & {
    readonly isStale: boolean;
    readonly noteId: string;
  },
): Row {
  const staleBadge: Pick<Row, "badge"> = isStale ? { badge: "Stale" } : {};
  switch (source) {
    case "cma": {
      return {
        ...staleBadge,
        line:
          cma === null
            ? "Not pulled yet"
            : `${vintageMonth(cma.latest)}, data ${formatDated(cma.latest.asOf, today)}`,
        name: "BlackRock CMA",
        pull: <CmaPull />,
      };
    }
    case "curve": {
      return {
        ...staleBadge,
        line:
          curve === null ? "Not pulled yet" : formatDated(curve.asOf, today),
        name: "BoE curve",
        pull: <CurvePull />,
      };
    }
    case "housePrices": {
      return {
        ...staleBadge,
        line:
          housePrices === null
            ? "Not pulled yet"
            : `Indexed to ${formatMonthShort(housePrices.to)}, pulled ${formatDay(housePrices.pulledOn)}`,
        name: "House prices",
        pull: <HousePricesPull isInScenario={false} />,
      };
    }
    case "portfolio": {
      return portfolioRowOf({ isStale, noteId, portfolio });
    }
  }
}

// A source's row: its name, marked with a caution badge where needed,
// naming the group, over its line, action, and optional note.
function SourceRow({
  household,
  isStale,
  portfolio,
  source,
  today,
}: Pick<SourcePullsProps, "household" | "portfolio" | "today"> & {
  readonly isStale: boolean;
  readonly source: Offered;
}): JSX.Element {
  const id = useId();
  const noteId = useId();
  const { badge, line, name, note, pull } = rowOf(source, {
    household,
    isStale,
    noteId,
    portfolio,
    today,
  });
  return (
    <div aria-labelledby={id} className="grid gap-1" role="group">
      <p className="flex flex-wrap items-center gap-2" id={id}>
        <span>{name}</span>
        {badge !== undefined && <Badge variant="caution">{badge}</Badge>}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="w-full text-muted-foreground @lg:w-auto">{line}</p>
        {pull}
      </div>
      {note !== undefined && (
        <p className="text-xs text-muted-foreground" id={noteId}>
          {note}
        </p>
      )}
    </div>
  );
}

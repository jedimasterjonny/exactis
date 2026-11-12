import type { JSX } from "react";

import { useId } from "react";

import type { Household } from "@/data/household";
import type { Month } from "@/data/schedule";

import { CmaPull } from "@/components/app/atoms/cma-pull";
import { CurvePull } from "@/components/app/atoms/curve-pull";
import { HousePricesPull } from "@/components/app/molecules/house-prices-pull";
import { Badge } from "@/components/kit/badge";
import { vintageMonth } from "@/data/cma";
import { formatDated, formatDay, formatMonthShort } from "@/lib/months";
import { sourcesOf } from "@/lib/sources";

// A source the month end offers, by the rule's name for it.
type Offered = ReturnType<typeof sourcesOf>[number]["source"];

// What a source's row says: its name, the line saying what is held and
// how old it is, and its pull.
interface Row {
  readonly line: string;
  readonly name: string;
  readonly pull: JSX.Element;
}

interface SourcePullsProps {
  readonly household: Pick<
    Household,
    "accounts" | "cma" | "curve" | "housePrices" | "rateSet"
  >;
  readonly month: Month;
  readonly today: string;
}

// The sources the month end's balances rest on, at the head of its
// worksheet, so they are pulled before the balances are checked: a
// section ruled off from the fields beneath it, named Sources, with a
// row for each source the month's rule offers, in its order. Each row
// is a group named by its name, with a caution badge saying Stale where
// a newer release should be out, so whoever tabs to its pull hears
// which source it is for and whether it is stale; beneath the name, the
// line saying what is held, as the assumptions screen's strip says it,
// or that it is not pulled yet, and its pull, beside the line where the
// section is wide enough and beneath it where it is not. Nothing is
// required: every pull is offered whether stale or not, and the save
// reads none of it. The house price pull is never held here, since the
// month end is closed only outside a scenario. The day it is is given
// rather than read, so the ages draw the same on the server as in a
// test.
export function SourcePulls({
  household,
  month,
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
        {sourcesOf(household, month).map(({ isStale, source }) => (
          <SourceRow
            isStale={isStale}
            key={source}
            row={rowOf(source, { household, today })}
          />
        ))}
      </div>
    </section>
  );
}

// A source's row as the household holds it, on the day given.
function rowOf(
  source: Offered,
  {
    household: { cma, curve, housePrices },
    today,
  }: Pick<SourcePullsProps, "household" | "today">,
): Row {
  switch (source) {
    case "cma": {
      return {
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
        line:
          curve === null ? "Not pulled yet" : formatDated(curve.asOf, today),
        name: "BoE curve",
        pull: <CurvePull />,
      };
    }
    case "housePrices": {
      return {
        line:
          housePrices === null
            ? "Not pulled yet"
            : `Indexed to ${formatMonthShort(housePrices.to)}, pulled ${formatDay(housePrices.pulledOn)}`,
        name: "House prices",
        pull: <HousePricesPull isInScenario={false} />,
      };
    }
  }
}

// A source's row: its name, marked stale where it is, naming the group,
// over its line and its pull.
function SourceRow({
  isStale,
  row: { line, name, pull },
}: {
  readonly isStale: boolean;
  readonly row: Row;
}): JSX.Element {
  const id = useId();
  return (
    <div aria-labelledby={id} className="grid gap-1" role="group">
      <p className="flex flex-wrap items-center gap-2" id={id}>
        <span>{name}</span>
        {isStale && <Badge variant="caution">Stale</Badge>}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="w-full text-muted-foreground @lg:w-auto">{line}</p>
        {pull}
      </div>
    </div>
  );
}

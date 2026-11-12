import type { Household } from "@/data/household";
import type { Month } from "@/data/schedule";

import { cutOf, monthIn, monthsBetween } from "@/lib/months";

// A source the month end offers to pull before the balances, and
// whether a newer one than the household holds should be out by now.
interface Source {
  readonly isStale: boolean;
  readonly source: "cma" | "curve" | "housePrices";
}

// The sources the balances of the month cut last rest on, in the order
// they are offered: BlackRock's capital market assumptions, always,
// since their risk drives the chances whichever rates are live; the
// Bank's curve, only under the CMA's rates, the one set that reads it;
// and the Land Registry's house price index, only where exactly one
// house with its purchase is listed, which is the household the house
// price pull accepts, as its houseIn reads it. Each is stale once a
// newer release than the one held should be out by the month's close,
// which is inferred from the publisher's cadence alone: nothing here
// knows whether one is, and nothing it cannot read is judged. The CMA
// is stale once its vintage is four or more months before the month,
// a quarter and a month for BlackRock to post the next. The curve is
// stale once its day falls two or more months before the month, so one
// pulled at the last close or since never is. The index is stale once
// it runs to three or more months before the month, the Registry
// publishing a month's two months on, by the cut, and it has not been
// pulled since the month's cut. A source never pulled is not stale,
// since nothing is there to be old.
export function sourcesOf(
  {
    accounts,
    cma,
    curve,
    housePrices,
    rateSet,
  }: Pick<Household, "accounts" | "cma" | "curve" | "housePrices" | "rateSet">,
  month: Month,
): readonly Source[] {
  const houses = accounts.filter(
    ({ bought, kind }) => kind === "house" && bought !== undefined,
  );
  return [
    {
      isStale: cma !== null && monthsBetween(cma.latest.vintage, month) >= 4,
      source: "cma",
    },
    ...(rateSet === "cma"
      ? [
          {
            isStale:
              curve !== null &&
              monthsBetween(monthIn(new Date(curve.asOf)), month) >= 2,
            source: "curve" as const,
          },
        ]
      : []),
    ...(houses.length === 1
      ? [
          {
            isStale:
              housePrices !== null &&
              monthsBetween(housePrices.to, month) >= 3 &&
              housePrices.pulledOn < cutOf(month),
            source: "housePrices" as const,
          },
        ]
      : []),
  ];
}

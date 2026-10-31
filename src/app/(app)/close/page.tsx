import type { JSX } from "react";

import { isDue } from "@/data/progress";
import { thisMonth, today } from "@/lib/months";
import { getHousehold, getOpened, getSinceClose } from "@/store/household";

import { CloseScreen } from "./close-screen";

// The month end, read from the store behind the session: the household,
// whether a scenario is open, and, only where the screen will compare
// it, the household as the close before the latest left it: not while a
// scenario is open, nor while last month is still to be closed, nor
// while the balances are being updated, as ?update asks. The page
// renders behind the loading screen beside it, and the month and the
// day are read once, on the server.
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
  const month = thisMonth();
  const isUpdating = update !== undefined;
  const isComparing =
    opened === null && !isUpdating && !isDue(household.points, month);
  return (
    <CloseScreen
      household={household}
      isInScenario={opened !== null}
      isUpdating={isUpdating}
      month={month}
      since={isComparing ? await getSinceClose() : null}
      today={today()}
    />
  );
}

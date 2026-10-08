import type { JSX } from "react";

import type { HousePrices } from "@/data/house-prices";
import type { ProgressPoint } from "@/data/progress";

import { Note } from "@/components/app/atoms/note";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { HousePricesPull } from "@/components/app/molecules/house-prices-pull";
import { ProgressChart } from "@/components/app/organisms/progress-chart";
import { ProgressPoints } from "@/components/app/organisms/progress-points";
import { ProgressYear } from "@/components/app/organisms/progress-year";
import { indexedAs } from "@/data/house-prices";
import { latestYearOf } from "@/data/progress";
import { balanceNames } from "@/lib/balances";
import { counted } from "@/lib/count";
import { formatDay, formatMonthShort, monthsBetween } from "@/lib/months";
import { progress, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

// The progress points, read from the store behind the session, under a
// header saying how many there are, over which months and how many of
// those were not kept, with the pull of the house price index as its
// action, and opening on what the latest year came to over the
// balances laid month by month. The chart is drawn whenever two points
// are kept, whether or not a year can be read: a latest point more than
// a year after the one before it has no year, but the months before it
// still lay out. A household keeping no point yet draws the table's
// empty state and no more, and one keeping a point alone has no year to
// read and nothing to lay along a chart. The notes at the foot say what
// net worth counts and what the house is held at, the index to the
// month it ran to or the sheet before one is pulled. The page renders
// behind the loading screen beside it.
export default async function Progress(): Promise<JSX.Element> {
  const { housePrices, points } = await getHousehold();
  const year = latestYearOf(points);
  return (
    <>
      <ScreenHeader
        actions={<HousePricesPull />}
        label={sectionLabel(progress)}
        title={progress.title}
      >
        {spanOf(points)}
      </ScreenHeader>
      <ScreenBody>
        {year !== undefined && <ProgressYear year={year} />}
        {points.length > 1 && <ProgressChart points={points} />}
        <ProgressPoints points={points} />
        <Note>
          Net worth is a point&apos;s five balances summed; cash is left out, as
          the sheet leaves it out.
        </Note>
        <Note>{houseNoteOf(housePrices)}</Note>
      </ScreenBody>
    </>
  );
}

// What the house in the property and vehicles is held at, as the foot
// says it: the index for the house from the month it was bought in,
// since a house held before it is the sheet's, to the month the index
// ran to, rolled forward after, and the day it was pulled; or the
// sheet's figures before an index is pulled, with what pulling one
// does.
function houseNoteOf(housePrices: HousePrices | null): string {
  if (housePrices === null) {
    return `${balanceNames.assets} holds the house as the sheet gave it; pull the UK House Price Index to hold it at the index for ${indexedAs} from the month it was bought.`;
  }
  return `${balanceNames.assets} holds the house since ${formatMonthShort(housePrices.from)} at the UK House Price Index for ${indexedAs}, to ${formatMonthShort(housePrices.to)} and rolled forward after; pulled ${formatDay(housePrices.pulledOn)}.`;
}

// What the points span, as the header says it: how many, from the
// first month to the last, and how many months between were not kept,
// where any were not. Nothing before any is kept.
function spanOf(points: readonly ProgressPoint[]): string | undefined {
  const [first] = points;
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    return undefined;
  }
  const missing = monthsBetween(first.month, last.month) + 1 - points.length;
  return [
    `${counted(points.length, "month-end")} from ${formatMonthShort(first.month)} to ${formatMonthShort(last.month)}`,
    ...(missing > 0 ? [`${String(missing)} missing`] : []),
  ].join(" · ");
}

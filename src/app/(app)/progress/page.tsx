import type { JSX } from "react";

import type { ProgressPoint } from "@/data/progress";

import { Note } from "@/components/app/atoms/note";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { ProgressPoints } from "@/components/app/organisms/progress-points";
import { ProgressYear } from "@/components/app/organisms/progress-year";
import { latestYearOf } from "@/data/progress";
import { counted } from "@/lib/count";
import { formatMonthShort, monthsBetween } from "@/lib/months";
import { progress, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

// The progress points, read from the store behind the session, under a
// header saying how many there are, over which months and how many of
// those were not kept, and opening on what the latest year came to. A
// household keeping no point yet draws the table's empty state and no
// more, and one keeping a point alone has no year to read. The page
// renders behind the loading screen beside it.
export default async function Progress(): Promise<JSX.Element> {
  const { points } = await getHousehold();
  const year = latestYearOf(points);
  return (
    <>
      <ScreenHeader label={sectionLabel(progress)} title={progress.title}>
        {spanOf(points)}
      </ScreenHeader>
      <ScreenBody>
        {year !== undefined && <ProgressYear year={year} />}
        <ProgressPoints points={points} />
        <Note>
          Net worth is a point&apos;s five balances summed; cash is left out, as
          the sheet leaves it out.
        </Note>
      </ScreenBody>
    </>
  );
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

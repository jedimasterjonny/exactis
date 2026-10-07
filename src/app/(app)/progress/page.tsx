import type { JSX } from "react";

import type { ProgressPoint } from "@/data/progress";

import { Note } from "@/components/app/atoms/note";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { ProgressPoints } from "@/components/app/organisms/progress-points";
import { netWorthOf } from "@/data/progress";
import { formatCount } from "@/lib/count";
import { formatGbp } from "@/lib/money";
import { formatMonthShort, monthName, monthsBetween } from "@/lib/months";
import { progress, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

interface TilesProps {
  readonly latest: ProgressPoint;
  readonly points: readonly ProgressPoint[];
}

// The progress points, read from the store behind the session, newest
// first, with the tiles read off the latest of them. A household
// keeping no point yet draws the table's empty state and no tiles,
// since there is nothing to read them off. The page renders behind the
// loading screen beside it.
export default async function Progress(): Promise<JSX.Element> {
  const { points } = await getHousehold();
  const latest = points.at(-1);
  return (
    <>
      <ScreenHeader label={sectionLabel(progress)} title={progress.title}>
        Newest first
      </ScreenHeader>
      <ScreenBody>
        {latest !== undefined && <Tiles latest={latest} points={points} />}
        <ProgressPoints points={points} />
        <Note>
          Net worth is a point&apos;s five balances summed; cash is left out, as
          the sheet leaves it out.
        </Note>
      </ScreenBody>
    </>
  );
}

// The four tiles: how many points there are and since when, the month
// the latest was read in, what the net worth moved by over the twelve
// months to it, from the point a year before or the earliest within the
// year where the points start later or a month is missing, and the net
// worth itself beside how far it moved from the point before. A point
// alone has moved from nothing but itself, and has no month before it.
function Tiles({ latest, points }: TilesProps): JSX.Element {
  const earlier = points.slice(0, -1);
  const first = earlier[0] ?? latest;
  const before = earlier.at(-1);
  const yearAgo =
    earlier.find((point) => monthsBetween(point.month, latest.month) <= 12) ??
    latest;
  const worth = netWorthOf(latest);
  const moved = worth - netWorthOf(yearAgo);
  return (
    <TileGrid>
      <StatTile
        caption={`Monthly since ${formatMonthShort(first.month)}`}
        label="Points recorded"
        value={formatCount(points.length)}
      />
      <StatTile
        label="Latest point"
        unit={String(latest.month.year)}
        value={monthName(latest.month.month, "short")}
      />
      <StatTile
        caption={`Net worth since ${formatMonthShort(yearAgo.month)}`}
        label="Tracked 12 months"
        value={`${moved > 0 ? "+" : ""}${formatGbp(moved)}`}
      />
      <StatTile
        {...(before !== undefined && {
          caption: `vs ${formatMonthShort(before.month)}`,
          delta: worth - netWorthOf(before),
        })}
        label="Net worth today"
        value={formatGbp(worth)}
      />
    </TileGrid>
  );
}

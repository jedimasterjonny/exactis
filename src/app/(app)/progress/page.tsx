import type { JSX } from "react";

import { Plus } from "lucide-react";

import { Note } from "@/components/app/note";
import { ProgressPoints } from "@/components/app/progress-points";
import { ScreenHeader } from "@/components/app/screen-header";
import { StatTile } from "@/components/app/stat-tile";
import { Button } from "@/components/kit/button";
import { points } from "@/data/points";
import { progress, sectionLabel } from "@/lib/nav";

// Every figure below is the reference kit's invented plan, standing in until
// there is a projection engine to read from.
export default function Progress(): JSX.Element {
  return (
    <>
      <ScreenHeader
        // Adding a point needs the edit dialog, which the button waits for.
        actions={
          <Button size="sm">
            <Plus aria-hidden />
            Add point
          </Button>
        }
        label={sectionLabel(progress)}
        title="Progress points"
      >
        Newest first
      </ScreenHeader>
      <div className="grid gap-5 p-8">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
          <StatTile
            caption="Monthly since Jan 2025"
            label="Points recorded"
            value="84"
          />
          <StatTile
            caption="Recorded 11 days ago"
            label="Latest point"
            unit="2026"
            value="31 Aug"
          />
          <StatTile
            caption="Net worth, today's money"
            label="Tracked 12 months"
            value="+£62,404"
          />
          <StatTile
            caption="vs last month"
            delta={4820}
            label="Net worth today"
            value="£533,671"
          />
        </div>
        <ProgressPoints points={points} />
        <Note>
          Net worth, assets and liabilities are derived from the values you
          record here.
        </Note>
      </div>
    </>
  );
}

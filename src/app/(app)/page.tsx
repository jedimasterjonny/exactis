import type { JSX } from "react";

import {
  Check,
  Flag,
  Landmark,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import { Suspense } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { ProjectionPending } from "@/components/app/organisms/projection-chart";
import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import { dashboard, sectionLabel } from "@/lib/nav";

import { Projection } from "./projection";

// The header and the tiles are the reference kit's invented plan, standing
// in until the engine projects what they show. The chart beneath them is
// the engine's, and streams in behind them, so the frame is served as it
// is while the store is read.
export default function Home(): JSX.Element {
  return (
    <>
      <ScreenHeader
        // The assumptions route does not exist yet, and typed routes reject
        // a link to a missing one, so the button gets its href with that route.
        actions={
          <Button size="sm">
            <SlidersHorizontal aria-hidden />
            Assumptions
          </Button>
        }
        label={sectionLabel(dashboard)}
        title="Projected to age 91"
      >
        <Badge variant="positive">
          <Check aria-hidden />
          On track
        </Badge>
        <Badge variant="secondary">CMA-derived · Aug 26</Badge>
        {"Figures in today's money"}
      </ScreenHeader>
      <ScreenBody>
        <TileGrid>
          <StatTile
            caption="Last working year 60"
            icon={Flag}
            label="Retirement"
            tone="inverse"
            unit="yrs"
            value="61"
          />
          <StatTile
            caption="vs Jul run"
            delta={231906}
            icon={Landmark}
            label="Net worth at 91"
            value="£4,218,760"
          />
          <StatTile
            caption="5-run mean, SD 0.52pp"
            delta={-1.15}
            deltaFormat="points"
            label="Chance of success"
            unit="%"
            value="95.40"
          />
          <StatTile
            caption="After IHT and estate costs"
            icon={ScrollText}
            label="Net legacy"
            value="£1,642,315"
          />
        </TileGrid>
        <Suspense fallback={<ProjectionPending />}>
          <Projection />
        </Suspense>
      </ScreenBody>
    </>
  );
}

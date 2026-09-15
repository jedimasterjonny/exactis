import type { JSX } from "react";

import {
  Check,
  Flag,
  Landmark,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";

import { ScreenHeader } from "@/components/screen-header";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Every figure below is the reference kit's invented plan, standing in until
// there is a projection engine to read from.
export default function Home(): JSX.Element {
  return (
    <main>
      <ScreenHeader
        // The assumptions route does not exist yet, and typed routes reject
        // a link to a missing one, so the button gets its href with that route.
        actions={
          <Button size="sm">
            <SlidersHorizontal aria-hidden />
            Assumptions
          </Button>
        }
        label="Sect. I · Dashboard"
        title="Projected to age 89"
      >
        <Badge variant="positive">
          <Check aria-hidden />
          On track
        </Badge>
        <Badge variant="secondary">CMA-derived · Aug 26</Badge>
        {"Figures in today's money"}
      </ScreenHeader>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4 p-8">
        <StatTile
          caption="Last working year 58"
          icon={Flag}
          label="Retirement"
          tone="inverse"
          unit="yrs"
          value="59"
        />
        <StatTile
          caption="vs Aug run"
          delta={250418}
          icon={Landmark}
          label="Net worth at 89"
          value="£4,533,429"
        />
        <StatTile
          caption="5-run mean, SD 0.44pp"
          delta={-0.96}
          deltaFormat="points"
          label="Chance of success"
          unit="%"
          value="96.90"
        />
        <StatTile
          caption="After IHT and estate costs"
          icon={ScrollText}
          label="Net legacy"
          value="£1,771,204"
        />
      </div>
    </main>
  );
}

import type { JSX } from "react";

import { Check, Landmark, ScrollText } from "lucide-react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { PlanAssumptions } from "@/components/app/organisms/plan-assumptions";
import { ProjectionBoard } from "@/components/app/organisms/projection-board";
import { Badge } from "@/components/kit/badge";
import { endAge } from "@/data/plan";
import { dashboard, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

// The dashboard, over the accounts, the lines, the milestones they are
// tied to and the plan read from the store behind the session: titled with the age the plan runs to,
// which the assumptions in the header set, then the tiles, then the
// projection. The board holds the milestone
// tile, since the milestone it reads is chosen on it and the retirement
// age set there; the badges and the rest
// of the tiles are the reference kit's invented plan, standing in until
// the engine projects what they show, save the age the net worth is
// read at, which is the plan's. It reads the store from its header
// down, since the header is titled with the age the plan runs to, so the
// whole of it renders behind the loading screen beside it rather than
// the chart alone. A phone keeps the milestone tile and the chance
// of success, the two the plan is steered by, in one row, and leaves
// the net worth and the legacy to a wider screen.
export default async function Dashboard(): Promise<JSX.Element> {
  const { accounts, milestones, plan, schedule } = await getHousehold();
  const age = String(endAge(plan));
  return (
    <>
      <ScreenHeader
        actions={<PlanAssumptions plan={plan} />}
        label={sectionLabel(dashboard)}
        title={`${dashboard.title} ${age}`}
      >
        <Badge variant="positive">
          <Check aria-hidden />
          On track
        </Badge>
        <Badge variant="secondary">CMA-derived · Aug 26</Badge>
        {"Figures in today's money"}
      </ScreenHeader>
      <ScreenBody>
        <ProjectionBoard
          accounts={accounts}
          milestones={milestones}
          plan={plan}
          schedule={schedule}
        >
          <StatTile
            caption="vs Aug run"
            delta={250418}
            icon={Landmark}
            isHiddenOnPhone
            label={`Net worth at ${age}`}
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
            isHiddenOnPhone
            label="Net legacy"
            value="£1,771,204"
          />
        </ProjectionBoard>
      </ScreenBody>
    </>
  );
}

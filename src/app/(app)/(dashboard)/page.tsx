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

// The dashboard, over the accounts, the lines, the milestones, the plan
// and the spread its rates carry, read from the store behind the
// session: titled with the age the plan runs to, which the assumptions
// in the header set, then the tiles, then the projection. The board
// holds the milestone tile, since the milestone it reads is chosen on
// it and the retirement age set there, and the chance of success,
// since the futures it is read over are the board's to draw, once,
// for the tiles and the chart alike, as the screen of that name draws
// them, with the milestones reached when conditions hold beside it,
// each at the median year the futures reach it; the badges and the
// rest of the tiles are the reference kit's invented plan, standing in
// until the engine projects what they show, save the age the net worth
// is read at, which is the plan's. It reads the store from its header
// down, since the header is titled with the age the plan runs to, so
// the whole of it renders behind the loading screen beside it rather
// than the chart alone. A phone keeps the milestone tile and the chance
// of success, the two the plan is steered by, in one row, and leaves
// the net worth and the legacy to a wider screen.
export default async function Dashboard(): Promise<JSX.Element> {
  const { accounts, milestones, plan, schedule, spread } = await getHousehold();
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
          spread={spread}
        >
          <StatTile
            caption="vs Jul run"
            delta={231906}
            icon={Landmark}
            isHiddenOnPhone
            label={`Net worth at ${age}`}
            value="£4,218,760"
          />
          <StatTile
            caption="After IHT and estate costs"
            icon={ScrollText}
            isHiddenOnPhone
            label="Net legacy"
            value="£1,642,315"
          />
        </ProjectionBoard>
      </ScreenBody>
    </>
  );
}

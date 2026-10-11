import type { JSX } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { PlanAssumptions } from "@/components/app/organisms/plan-assumptions";
import { ProjectionBoard } from "@/components/app/organisms/projection-board";
import { Badge } from "@/components/kit/badge";
import { vintageMonth } from "@/data/cma";
import { endAge } from "@/data/plan";
import { dashboard, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

// The dashboard, over the accounts, the lines, the milestones, the plan
// and the spread its rates carry, read from the store behind the
// session: titled with the age the plan runs to, which the assumptions
// in the header set, then the tiles, then the projection. The board
// holds every tile: the milestone tile, since the milestone it reads is
// chosen on it and the retirement age set there; the chance of success,
// since the futures it is read over are the board's to draw, once, for
// the tiles and the chart alike, as the screen of that name draws them,
// with the milestones reached when conditions hold beside it, each at
// the median year the futures reach it; and the net worth entering the
// plan's last year, since it reads the projection the board runs as
// the age is dragged. The badge names the set of rates the plan runs
// on as the store holds it, the CMA's vintage with it when that set is
// live, since the manual method's worst failure was a plan running on
// a set nobody knew was live. The kit's verdict and its legacy tile are
// gone rather than standing in: nothing here grades the plan but the
// chance of success, and nothing models an estate. It reads the store
// from its header down, since the header is titled with the age the
// plan runs to, so the whole of it renders behind the loading screen
// beside it rather than the chart alone.
export default async function Dashboard(): Promise<JSX.Element> {
  const { accounts, cma, milestones, plan, rateSet, schedule, spread } =
    await getHousehold();
  const age = String(endAge(plan));
  // The store refuses a household running on the CMA's rates with no CMA
  // pulled, so a vintage is always there to name; the check on it is for
  // the type, which does not know.
  const rates =
    rateSet === "cma" && cma !== null
      ? `CMA-derived rates · ${vintageMonth(cma.latest)}`
      : "Custom rates";
  return (
    <>
      <ScreenHeader
        actions={<PlanAssumptions plan={plan} />}
        label={sectionLabel(dashboard)}
        title={`${dashboard.title} ${age}`}
      >
        <Badge variant="secondary">{rates}</Badge>
        {"Figures in today's money"}
      </ScreenHeader>
      <ScreenBody>
        <ProjectionBoard
          accounts={accounts}
          milestones={milestones}
          plan={plan}
          schedule={schedule}
          spread={spread}
        />
      </ScreenBody>
    </>
  );
}

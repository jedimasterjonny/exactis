import type { JSX } from "react";

import {
  Check,
  Flag,
  Landmark,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { TileGrid } from "@/components/app/atoms/tile-grid";
import { StatTile } from "@/components/app/molecules/stat-tile";
import { ProjectionBoard } from "@/components/app/organisms/projection-board";
import { ProjectionPending } from "@/components/app/organisms/projection-chart";
import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import { endAge } from "@/data/plan";
import { dashboard, sectionLabel } from "@/lib/nav";
import { getAccounts } from "@/store/accounts";
import { getPlan } from "@/store/plan";
import { getExpenseLines, getIncomeLines } from "@/store/schedule";

// The dashboard, over the accounts, the lines and the plan read from
// the store behind the session: titled with the age the plan runs to,
// then the tiles, then the projection. The badges and the tiles are the
// reference kit's invented plan, standing in until the engine projects
// what they show, save the age the net worth is read at, which is the
// plan's. It is its own component so the page can stream it in behind
// the pending frame, since every part of it now reads the store.
export async function Dashboard(): Promise<JSX.Element> {
  const [accounts, income, expenses, plan] = await Promise.all([
    getAccounts(),
    getIncomeLines(),
    getExpenseLines(),
    getPlan(),
  ]);
  const age = String(endAge(plan));
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
        title={`Projected to age ${age}`}
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
            label={`Net worth at ${age}`}
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
        <ProjectionBoard
          accounts={accounts}
          plan={plan}
          schedule={{ expenses, income }}
        />
      </ScreenBody>
    </>
  );
}

// What stands in the dashboard's place while the store answers: its
// label and its title, less the age it has yet to read, and the
// chart's frame, which says what is being waited on. The badges, the
// assumptions and the tiles are not stood in for, so when the
// dashboard arrives they land around the frame and the frame moves
// down beneath the tiles.
export function DashboardPending(): JSX.Element {
  return (
    <>
      <ScreenHeader
        label={sectionLabel(dashboard)}
        title="Projected to age …"
      />
      <ScreenBody>
        <ProjectionPending />
      </ScreenBody>
    </>
  );
}

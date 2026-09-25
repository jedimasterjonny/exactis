import type { JSX } from "react";

import { ProjectionChart } from "@/components/app/organisms/projection-chart";
import { retirementYear } from "@/data/plan";
import { getPlan, getProjection } from "@/store/plan";

// The dashboard's chart, read from the store behind the session, with
// the year the plan's owner retires in marked on it. It is its own
// component so the page can stream it in behind the frame around it,
// which needs nothing from the store and is served as it is.
export async function Projection(): Promise<JSX.Element> {
  const [points, plan] = await Promise.all([getProjection(), getPlan()]);
  return <ProjectionChart points={points} retirement={retirementYear(plan)} />;
}

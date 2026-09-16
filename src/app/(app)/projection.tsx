import type { JSX } from "react";

import { ProjectionChart } from "@/components/app/organisms/projection-chart";

import { getProjection } from "./store";

// The dashboard's chart, read from the store behind the session. It is
// its own component so the page can stream it in behind the frame around
// it, which needs nothing from the store and is served as it is.
export async function Projection(): Promise<JSX.Element> {
  return <ProjectionChart points={await getProjection()} />;
}
